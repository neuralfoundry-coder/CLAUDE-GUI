import type { ClaudeServerMessage } from '@/types/websocket';
import { useArtifactStore } from '@/stores/use-artifact-store';
import type { ClaudeState } from '@/stores/use-claude-store';
import type {
  ChatMessage,
  SdkAssistantMessage,
  SdkPartialAssistantMessage,
  SdkResultMessage,
  SdkSystemMessage,
  SdkToolProgressMessage,
} from './types';
import {
  FILE_EDIT_TOOLS,
  STREAMING_EDIT_FLUSH_INTERVAL,
  emptyStats,
  emptyTabState,
  extractContent,
  extractFilePath,
  nextId,
  pickModelUsage,
  tryParsePartialJson,
} from './helpers';
import {
  ensureExtractor,
  finalizeExtractor,
  getStreamingToolInputs,
  requestToTabMap,
} from './extractors';
import {
  assignSessionToTab,
  resolveTabId,
  updateTabState,
} from './routing';
import { forwardToolToEditor } from './forward-to-editor';

/**
 * Zustand `set` signature narrowed to the updater-returning-partial form used
 * throughout this module. We accept the parent state and return a patch.
 */
type SetFn = (
  fn: (s: ClaudeState) => Partial<ClaudeState> | ClaudeState,
) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Per-token streaming via `stream_event`
// ─────────────────────────────────────────────────────────────────────────────

export function handleStreamEvent(
  set: SetFn,
  reqId: string | undefined,
  partial: SdkPartialAssistantMessage,
): void {
  const evt = partial.event;

  set((s) => {
    const tabId = resolveTabId(s, partial.session_id, reqId);
    if (!tabId) return s;

    // Text deltas (per-token).
    if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
      const deltaText = evt.delta.text;
      const extractor = ensureExtractor(tabId, partial.session_id ?? 'stream');
      extractor.feedText(deltaText);

      const ts = s.tabStates[tabId] ?? emptyTabState();
      const prev = ts.messages;
      const last = prev[prev.length - 1];

      if (last && last.role === 'assistant' && last.kind === 'text' && last.isStreaming) {
        // Append incrementally — avoids O(n²) chunks.join on every token.
        const content = last.content + deltaText;
        const chunks = ts.streamingChunks;
        chunks.push(deltaText);
        const updated: ChatMessage = { ...last, content, timestamp: Date.now() };
        const nextMessages = prev.slice(0, -1);
        nextMessages.push(updated);
        return {
          ...assignSessionToTab(s, tabId, partial.session_id),
          ...updateTabState(s, tabId, () => ({
            messages: nextMessages,
            streamingChunks: chunks,
          })),
        };
      }

      const newId = nextId('a');
      return {
        ...assignSessionToTab(s, tabId, partial.session_id),
        ...updateTabState(s, tabId, () => ({
          messages: [
            ...prev,
            {
              id: newId,
              role: 'assistant' as const,
              kind: 'text' as const,
              content: deltaText,
              timestamp: Date.now(),
              isStreaming: true,
            },
          ],
          streamingChunks: [deltaText],
          streamingMessageId: newId,
        })),
      };
    }

    // content_block_start for a tool_use — append a streaming tool message.
    if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
      const block = evt.content_block;
      const blockIndex = evt.index ?? -1;
      if (block.name && FILE_EDIT_TOOLS.has(block.name) && blockIndex >= 0) {
        getStreamingToolInputs(tabId).set(blockIndex, {
          toolName: block.name,
          chunks: [],
          lastFlushAt: Date.now(),
          filePath: null,
        });
      }
      return updateTabState(s, tabId, (ts) => ({
        messages: [
          ...ts.messages,
          {
            id: nextId('t'),
            role: 'tool' as const,
            kind: 'tool_use' as const,
            content: block.name ? `Running ${block.name}...` : 'Running tool...',
            toolName: block.name ?? 'unknown',
            toolInput: block.input,
            timestamp: Date.now(),
            isStreaming: true,
          },
        ],
      }));
    }

    // input_json_delta — accumulate partial JSON for streaming file edits.
    if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta' && evt.delta.partial_json) {
      const blockIndex = evt.index ?? -1;
      const tracker = getStreamingToolInputs(tabId).get(blockIndex);
      if (tracker) {
        tracker.chunks.push(evt.delta.partial_json);
        const now = Date.now();
        if (now - tracker.lastFlushAt >= STREAMING_EDIT_FLUSH_INTERVAL) {
          tracker.lastFlushAt = now;
          const parsed = tryParsePartialJson(tracker.chunks);
          if (parsed) {
            const fp = extractFilePath(parsed);
            if (fp) tracker.filePath = fp;
            if (tracker.toolName === 'Write' && typeof parsed.content === 'string' && tracker.filePath) {
              void forwardToolToEditor(
                { name: 'Write', input: { file_path: tracker.filePath, content: parsed.content } },
                'streaming',
              );
            }
          }
        }
      }
    }

    // content_block_stop — flush any finalized tool input to the editor.
    if (evt.type === 'content_block_stop') {
      const blockIndex = evt.index ?? -1;
      const toolInputs = getStreamingToolInputs(tabId);
      const tracker = toolInputs.get(blockIndex);
      if (tracker) {
        toolInputs.delete(blockIndex);
        const parsed = tryParsePartialJson(tracker.chunks);
        if (parsed && tracker.filePath) {
          void forwardToolToEditor({ name: tracker.toolName, input: parsed }, 'final');
        }
      }
    }

    return s;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool progress (elapsed-time updates on a streaming tool message)
// ─────────────────────────────────────────────────────────────────────────────

export function handleToolProgress(
  set: SetFn,
  reqId: string | undefined,
  progress: SdkToolProgressMessage,
): void {
  set((s) => {
    const tabId = resolveTabId(s, progress.session_id, reqId);
    if (!tabId) return s;
    return updateTabState(s, tabId, (ts) => {
      const idx = ts.messages.findLastIndex(
        (m) => m.role === 'tool' && m.toolName === progress.tool_name && m.isStreaming,
      );
      if (idx < 0) return {};
      const nextMessages: ChatMessage[] = ts.messages.slice();
      const existing = nextMessages[idx];
      nextMessages[idx] = {
        ...existing,
        content: `Running ${progress.tool_name}... (${Math.round(progress.elapsed_time_seconds)}s)`,
      } as ChatMessage;
      return { messages: nextMessages };
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// System init message — assigns session, records model, and may insert a
// "thinking" placeholder while the first real delta is in flight.
// ─────────────────────────────────────────────────────────────────────────────

export function handleSystemMessage(
  set: SetFn,
  reqId: string | undefined,
  sys: SdkSystemMessage,
): void {
  if (!sys.session_id) return;
  const sid = sys.session_id;
  set((s) => {
    const tabId = resolveTabId(s, sid, reqId);
    if (!tabId) return s;
    const ts = s.tabStates[tabId] ?? emptyTabState();
    const prev = s.sessionStats[sid] ?? emptyStats(sid);
    const hasStreamingAssistant = ts.streamingMessageId !== null;
    const shouldInsertThinking = !hasStreamingAssistant && ts.isStreaming;
    const thinkingId = shouldInsertThinking ? nextId('a') : null;
    return {
      ...assignSessionToTab(s, tabId, sid),
      ...updateTabState(s, tabId, (ts) => ({
        messages: shouldInsertThinking
          ? [
              ...ts.messages,
              {
                id: thinkingId!,
                role: 'assistant' as const,
                kind: 'text' as const,
                content: '',
                timestamp: Date.now(),
                isStreaming: true,
              },
            ]
          : ts.messages,
        streamingMessageId: thinkingId ?? ts.streamingMessageId,
        streamingChunks: shouldInsertThinking ? [] : ts.streamingChunks,
      })),
      sessionStats: {
        ...s.sessionStats,
        [sid]: { ...prev, model: sys.model ?? prev.model, lastUpdated: Date.now() },
      },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Full assistant message (text + tool_use combo), replacing or extending any
// streamed assistant message.
// ─────────────────────────────────────────────────────────────────────────────

export function handleAssistantMessage(
  set: SetFn,
  reqId: string | undefined,
  asst: SdkAssistantMessage,
): void {
  const { text, tools } = extractContent(asst.message?.content);
  set((s) => {
    const tabId = resolveTabId(s, asst.session_id, reqId);
    if (!tabId) return s;
    const extractor = ensureExtractor(tabId, asst.session_id ?? 'stream');
    const ts = s.tabStates[tabId] ?? emptyTabState();
    const alreadyStreamedViaDeltas = ts.streamingMessageId !== null;
    if (!alreadyStreamedViaDeltas && text) extractor.feedText(text);
    for (const tool of tools) extractor.feedToolUse(tool);

    const artifactStore = useArtifactStore.getState();
    const toolSessionId = asst.session_id ?? null;
    for (const tool of tools) artifactStore.ingestToolUse(nextId('tool'), toolSessionId, tool);
    for (const tool of tools) {
      if (FILE_EDIT_TOOLS.has(tool.name)) void forwardToolToEditor(tool, 'final');
    }

    let newAssistantMessageId: string | null = null;
    const prev = ts.messages;
    const last = prev[prev.length - 1];
    const hasStreamingAssistant =
      last && last.role === 'assistant' && last.kind === 'text' && last.isStreaming;

    const nextMessages = prev.slice();
    let nextChunks = ts.streamingChunks;
    let nextStreamingId = ts.streamingMessageId;

    if (text) {
      if (hasStreamingAssistant) {
        const updated: ChatMessage = { ...last, content: text, timestamp: Date.now() };
        nextMessages[nextMessages.length - 1] = updated;
        newAssistantMessageId = updated.id;
        nextChunks = [text];
      } else {
        newAssistantMessageId = nextId('a');
        nextStreamingId = newAssistantMessageId;
        nextChunks = [text];
        nextMessages.push({
          id: newAssistantMessageId,
          role: 'assistant',
          kind: 'text',
          content: text,
          timestamp: Date.now(),
          isStreaming: true,
        });
      }
    }

    for (const tool of tools) {
      const existingIdx = nextMessages.findLastIndex(
        (m) => m.role === 'tool' && m.toolName === tool.name && m.isStreaming,
      );
      if (existingIdx >= 0) {
        const prev = nextMessages[existingIdx];
        nextMessages[existingIdx] = {
          ...prev,
          content: JSON.stringify(tool.input).slice(0, 300),
          toolInput: tool.input,
          isStreaming: false,
        } as ChatMessage;
      } else {
        nextMessages.push({
          id: nextId('t'),
          role: 'tool',
          kind: 'tool_use',
          content: JSON.stringify(tool.input).slice(0, 300),
          toolName: tool.name,
          toolInput: tool.input,
          timestamp: Date.now(),
        });
      }
    }

    if (text && newAssistantMessageId) {
      useArtifactStore.getState().extractFromMessage(newAssistantMessageId, asst.session_id ?? null, text);
    }

    return {
      ...assignSessionToTab(s, tabId, asst.session_id),
      ...updateTabState(s, tabId, () => ({
        messages: nextMessages,
        streamingChunks: nextChunks,
        streamingMessageId: nextStreamingId,
      })),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission request — store under the active tab so the permission modal shows.
// ─────────────────────────────────────────────────────────────────────────────

type PermissionRequestMsg = Extract<ClaudeServerMessage, { type: 'permission_request' }>;

export function handlePermissionRequest(set: SetFn, msg: PermissionRequestMsg): void {
  set((s) => {
    const tabId = s.activeTabId;
    if (!tabId) return { pendingPermission: msg };
    return updateTabState(s, tabId, () => ({ pendingPermission: msg }));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto decision — system banner showing a persistent-rule allow/deny.
// ─────────────────────────────────────────────────────────────────────────────

type AutoDecisionMsg = Extract<ClaudeServerMessage, { type: 'auto_decision' }>;

export function handleAutoDecision(
  set: SetFn,
  reqId: string | undefined,
  sessionId: string | undefined,
  msg: AutoDecisionMsg,
): void {
  set((s) => {
    const tabId = resolveTabId(s, sessionId, reqId);
    if (!tabId) return s;
    const label =
      msg.decision === 'allow'
        ? `Auto-allowed ${msg.tool} (persistent rule)`
        : `Auto-denied ${msg.tool} (persistent rule)`;
    return updateTabState(s, tabId, (ts) => ({
      messages: [
        ...ts.messages,
        {
          id: nextId('ad'),
          role: 'system',
          kind: 'auto_decision',
          content: label,
          timestamp: Date.now(),
          toolName: msg.tool,
        },
      ],
    }));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Result — finalize streaming state, accumulate cost + stats.
// ─────────────────────────────────────────────────────────────────────────────

export function handleResult(
  set: SetFn,
  reqId: string | undefined,
  data: SdkResultMessage,
): void {
  if (reqId) requestToTabMap.delete(reqId);
  set((s) => {
    const tabId = resolveTabId(s, data.session_id, reqId);
    if (!tabId) return s;
    finalizeExtractor(tabId);
    useArtifactStore.getState().flushPendingOpen();
    const ts = s.tabStates[tabId] ?? emptyTabState();
    const nextMessages = ts.messages.map((m) =>
      m.isStreaming ? { ...m, isStreaming: false } : m,
    );

    const sid = data.session_id ?? s.tabs.find((t) => t.id === tabId)?.sessionId;
    const nextStats = { ...s.sessionStats };
    if (sid) {
      const prev = nextStats[sid] ?? emptyStats(sid);
      const mu = pickModelUsage(data.modelUsage, prev.model);
      const ctxTokens = mu
        ? (mu.inputTokens ?? 0) + (mu.cacheReadInputTokens ?? 0) + (mu.cacheCreationInputTokens ?? 0)
        : null;
      nextStats[sid] = {
        ...prev,
        numTurns: data.num_turns ?? prev.numTurns,
        durationMs: data.duration_ms ?? prev.durationMs,
        inputTokens: prev.inputTokens + (data.usage?.input_tokens ?? 0),
        outputTokens: prev.outputTokens + (data.usage?.output_tokens ?? 0),
        cacheReadTokens: prev.cacheReadTokens + (data.usage?.cache_read_input_tokens ?? 0),
        costUsd: prev.costUsd + (data.total_cost_usd ?? 0),
        lastUpdated: Date.now(),
        lastContextTokens: ctxTokens ?? prev.lastContextTokens,
        contextWindow: mu?.contextWindow ?? prev.contextWindow,
      };
    }
    return {
      ...assignSessionToTab(s, tabId, data.session_id),
      ...updateTabState(s, tabId, () => ({
        messages: nextMessages,
        streamingChunks: [],
        streamingMessageId: null,
        isStreaming: false,
        currentRequestId: null,
      })),
      totalCost: s.totalCost + (data.total_cost_usd || 0),
      tokenUsage: {
        input: s.tokenUsage.input + (data.usage?.input_tokens || 0),
        output: s.tokenUsage.output + (data.usage?.output_tokens || 0),
      },
      sessionStats: nextStats,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Error — append error message, end streaming state.
// ─────────────────────────────────────────────────────────────────────────────

type ErrorMsg = Extract<ClaudeServerMessage, { type: 'error' }>;

export function handleError(
  set: SetFn,
  reqId: string | undefined,
  sessionId: string | undefined,
  msg: ErrorMsg,
): void {
  if (reqId) requestToTabMap.delete(reqId);
  set((s) => {
    const tabId = resolveTabId(s, sessionId, reqId);
    if (!tabId) return s;
    finalizeExtractor(tabId);
    useArtifactStore.getState().flushPendingOpen();
    return updateTabState(s, tabId, (ts) => ({
      isStreaming: false,
      streamingChunks: [],
      streamingMessageId: null,
      currentRequestId: null,
      messages: [
        ...ts.messages.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
        {
          id: nextId('e'),
          role: 'assistant',
          kind: 'error',
          content: `Error: ${msg.message}`,
          timestamp: Date.now(),
        },
      ],
    }));
  });
}
