'use client';

import { create } from 'zustand';
import type { ClaudeServerMessage } from '@/types/websocket';
import { sessionsApi, type SessionHistoryMessage } from '@/lib/api-client';
import { UniversalStreamExtractor } from '@/lib/claude/universal-stream-extractor';
import { useLivePreviewStore } from '@/stores/use-live-preview-store';
import { useArtifactStore } from '@/stores/use-artifact-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { useLayoutStore } from '@/stores/use-layout-store';
import { applyEditOps } from '@/lib/claude/artifact-from-tool';

export type MessageKind = 'text' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'auto_decision';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  kind: MessageKind;
  content: string;
  timestamp: number;
  toolName?: string;
  toolInput?: unknown;
  isStreaming?: boolean;
}

export interface SessionStats {
  sessionId: string;
  model: string | null;
  numTurns: number | null;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  lastUpdated: number | null;
  lastContextTokens: number | null;
  contextWindow: number | null;
}

function emptyStats(sessionId: string): SessionStats {
  return {
    sessionId,
    model: null,
    numTurns: null,
    durationMs: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0,
    lastUpdated: null,
    lastContextTokens: null,
    contextWindow: null,
  };
}

interface SdkContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
}

interface SdkAssistantMessage {
  type: 'assistant';
  message: { content: SdkContentBlock[]; usage?: { input_tokens?: number; output_tokens?: number } };
  session_id?: string;
}

interface SdkUserMessage {
  type: 'user';
  message: { content: SdkContentBlock[] | string };
  session_id?: string;
}

interface SdkSystemMessage {
  type: 'system';
  subtype?: string;
  session_id?: string;
  model?: string;
}

/** Raw Anthropic API stream event, forwarded by the SDK as `type: 'stream_event'`. */
interface SdkPartialAssistantMessage {
  type: 'stream_event';
  event: {
    type: string;
    index?: number;
    delta?: { type: string; text?: string; partial_json?: string };
    content_block?: { type: string; id?: string; name?: string; input?: unknown; text?: string };
  };
  session_id: string;
}

/** Tool execution progress, emitted while a tool is running. */
interface SdkToolProgressMessage {
  type: 'tool_progress';
  tool_use_id: string;
  tool_name: string;
  elapsed_time_seconds: number;
  session_id: string;
}

interface SdkModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  webSearchRequests?: number;
  costUSD?: number;
  contextWindow?: number;
}

interface SdkResultMessage {
  type: 'result';
  subtype?: string;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  session_id?: string;
  num_turns?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
  modelUsage?: Record<string, SdkModelUsage>;
}

function pickModelUsage(
  modelUsage: Record<string, SdkModelUsage> | undefined,
  preferredModel: string | null,
): SdkModelUsage | null {
  if (!modelUsage) return null;
  if (preferredModel && modelUsage[preferredModel]) return modelUsage[preferredModel];
  let best: SdkModelUsage | null = null;
  let bestWindow = 0;
  for (const usage of Object.values(modelUsage)) {
    const window = usage.contextWindow ?? 0;
    if (window >= bestWindow) {
      best = usage;
      bestWindow = window;
    }
  }
  return best;
}

const ALL_MESSAGE_KINDS: MessageKind[] = ['text', 'tool_use', 'tool_result', 'system', 'error', 'auto_decision'];

interface ClaudeState {
  messages: ChatMessage[];
  /** Chunks accumulated during streaming — joined on stream end to avoid O(n²) string concat. */
  streamingChunks: string[];
  /** ID of the assistant message currently being streamed into. */
  streamingMessageId: string | null;
  isStreaming: boolean;
  activeSessionId: string | null;
  pendingPermission: Extract<ClaudeServerMessage, { type: 'permission_request' }> | null;
  totalCost: number;
  tokenUsage: { input: number; output: number };
  currentRequestId: string | null;
  sessionStats: Record<string, SessionStats>;
  messageFilter: Set<MessageKind>;

  pushUserMessage: (content: string) => string;
  handleServerMessage: (msg: ClaudeServerMessage) => void;
  setPendingPermission: (req: Extract<ClaudeServerMessage, { type: 'permission_request' }> | null) => void;
  reset: () => void;
  setActiveSessionId: (id: string | null) => void;
  setStreaming: (streaming: boolean) => void;
  setCurrentRequestId: (id: string | null) => void;
  toggleFilter: (kind: MessageKind) => void;
  loadSession: (id: string) => Promise<void>;
}

function extractContent(blocks: SdkContentBlock[] | string | undefined): {
  text: string;
  tools: Array<{ name: string; input: unknown }>;
} {
  if (!blocks) return { text: '', tools: [] };
  if (typeof blocks === 'string') return { text: blocks, tools: [] };
  let text = '';
  const tools: Array<{ name: string; input: unknown }> = [];
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') {
      text += (text ? '\n' : '') + block.text;
    } else if (block.type === 'tool_use') {
      tools.push({ name: block.name ?? 'unknown', input: block.input });
    }
  }
  return { text, tools };
}

let msgCounter = 0;
function nextId(prefix: string): string {
  msgCounter += 1;
  return `${prefix}-${Date.now()}-${msgCounter}`;
}

let currentExtractor: UniversalStreamExtractor | null = null;

async function fetchFileContent(filePath: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { content?: unknown }; content?: unknown };
    const content = json?.data?.content ?? json?.content;
    return typeof content === 'string' ? content : null;
  } catch {
    return null;
  }
}

// ---- Streaming tool input accumulation (input_json_delta) ----
interface StreamingToolInput {
  toolName: string;
  chunks: string[];
  lastFlushAt: number;
  filePath: string | null;
}
const streamingToolInputs = new Map<number, StreamingToolInput>();
const STREAMING_EDIT_FLUSH_INTERVAL = 500; // ms

function tryParsePartialJson(chunks: string[]): Record<string, unknown> | null {
  const raw = chunks.join('');
  // Try to parse the accumulated JSON; the SDK streams partial JSON that may
  // not be valid yet, so wrap in braces and attempt recovery.
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch { /* not parseable yet */ }
  // Try adding a closing brace — the SDK often streams valid-up-to-the-cursor JSON
  try {
    return JSON.parse(raw + '"}') as Record<string, unknown>;
  } catch { /* still not parseable */ }
  try {
    return JSON.parse(raw + '"}]}') as Record<string, unknown>;
  } catch { /* still not parseable */ }
  return null;
}

function extractFilePath(parsed: Record<string, unknown>): string | null {
  if (typeof parsed.file_path === 'string' && parsed.file_path) return parsed.file_path;
  return null;
}

const FILE_EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

/** Forward a tool_use result to the editor as a streaming or final diff. */
async function forwardToolToEditor(
  tool: { name: string; input: unknown },
  mode: 'streaming' | 'final',
): Promise<void> {
  if (!FILE_EDIT_TOOLS.has(tool.name)) return;
  const input = tool.input as Record<string, unknown> | null;
  if (!input) return;
  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  if (!filePath) return;

  const editorStore = useEditorStore.getState();
  const layoutStore = useLayoutStore.getState();

  // Auto-expand editor panel
  if (layoutStore.editorCollapsed) {
    layoutStore.setCollapsed('editor', false);
  }

  // Auto-expand preview panel for previewable file types
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const PREVIEWABLE_EXTS = new Set(['html', 'htm', 'svg', 'md', 'markdown']);
  if (PREVIEWABLE_EXTS.has(ext) && layoutStore.previewCollapsed) {
    layoutStore.setCollapsed('preview', false);
  }

  // Ensure the file is open in the editor
  const existingTab = editorStore.tabs.find((t) => t.path === filePath);
  if (!existingTab) {
    await editorStore.openFile(filePath);
  }

  // Compute modified content
  let modified: string | undefined;
  if (tool.name === 'Write') {
    modified = typeof input.content === 'string' ? input.content : undefined;
  } else {
    // Edit / MultiEdit — apply ops against baseline
    const tab = useEditorStore.getState().tabs.find((t) => t.path === filePath);
    const baseline = tab?.diff?.original ?? tab?.content;
    if (baseline) {
      const ops: Array<{ oldString: string; newString: string; replaceAll: boolean }> = [];
      if (typeof input.old_string === 'string' && typeof input.new_string === 'string') {
        ops.push({ oldString: input.old_string, newString: input.new_string as string, replaceAll: input.replace_all === true });
      }
      if (Array.isArray(input.edits)) {
        for (const entry of input.edits) {
          if (!entry || typeof entry !== 'object') continue;
          const obj = entry as Record<string, unknown>;
          if (typeof obj.old_string !== 'string' || typeof obj.new_string !== 'string') continue;
          ops.push({ oldString: obj.old_string, newString: obj.new_string, replaceAll: obj.replace_all === true });
        }
      }
      modified = applyEditOps(baseline, ops);
    }
  }

  if (modified === undefined) return;

  if (mode === 'streaming') {
    useEditorStore.getState().updateStreamingEdit(filePath, modified);
  } else {
    useEditorStore.getState().applyClaudeEdit(filePath, modified);
  }
}

function ensureExtractor(streamId: string): UniversalStreamExtractor {
  if (currentExtractor) return currentExtractor;
  const live = useLivePreviewStore.getState();
  live.startStream(streamId);

  currentExtractor = new UniversalStreamExtractor({
    onPageStart: (page) => {
      useLivePreviewStore.getState().addPage(page);
    },
    onPageChunk: (pageId, content, renderable) => {
      useLivePreviewStore.getState().updatePageContent(pageId, content, renderable);
    },
    onPageComplete: (pageId, content) => {
      useLivePreviewStore.getState().completePage(pageId, content);
    },
    onWritePath: (_pageId, filePath) => {
      useLivePreviewStore.getState().setGeneratedFilePath(filePath);
    },
    onNeedBaseline: (filePath, apply) => {
      void fetchFileContent(filePath).then((content) => {
        if (content) apply(content);
      });
    },
  });

  // Seed the extractor with prior baselines from existing pages so
  // Edit/MultiEdit in a follow-up stream can patch the last known content.
  const pages = useLivePreviewStore.getState().pages;
  for (const page of pages) {
    if (page.filePath && page.content) {
      currentExtractor.seedBaseline(page.filePath, page.content);
    }
  }
  return currentExtractor;
}

function finalizeExtractor(): void {
  if (!currentExtractor) return;
  currentExtractor.finalize();
  currentExtractor = null;
  useLivePreviewStore.getState().finalize();
}

export const useClaudeStore = create<ClaudeState>((set) => ({
  messages: [],
  streamingChunks: [],
  streamingMessageId: null,
  isStreaming: false,
  activeSessionId: null,
  pendingPermission: null,
  totalCost: 0,
  tokenUsage: { input: 0, output: 0 },
  currentRequestId: null,
  sessionStats: {},
  messageFilter: new Set<MessageKind>(ALL_MESSAGE_KINDS),

  pushUserMessage: (content) => {
    const id = nextId('u');
    set((s) => ({
      messages: [...s.messages, { id, role: 'user', kind: 'text', content, timestamp: Date.now() }],
    }));
    return id;
  },

  handleServerMessage: (msg) => {
    switch (msg.type) {
      case 'message': {
        const data = (msg as { data: SdkAssistantMessage | SdkUserMessage | SdkSystemMessage | SdkPartialAssistantMessage | SdkToolProgressMessage }).data;

        // ---- Per-token streaming via stream_event ----
        if (data.type === 'stream_event') {
          const partial = data as SdkPartialAssistantMessage;
          const evt = partial.event;

          // Handle text deltas (per-token)
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
            const deltaText = evt.delta.text;
            const extractor = ensureExtractor(partial.session_id ?? 'stream');
            extractor.feedText(deltaText);

            set((s) => {
              const prev = s.messages;
              const last = prev[prev.length - 1];

              if (last && last.role === 'assistant' && last.kind === 'text' && last.isStreaming) {
                // Append delta to existing streaming message
                const chunks = s.streamingChunks;
                chunks.push(deltaText);
                const content = chunks.join('');
                const updated: ChatMessage = { ...last, content, timestamp: Date.now() };
                const nextMessages = prev.slice(0, -1);
                nextMessages.push(updated);
                return {
                  messages: nextMessages,
                  streamingChunks: chunks,
                  activeSessionId: partial.session_id ?? s.activeSessionId,
                };
              }

              // First text delta — create new streaming message
              const newId = nextId('a');
              return {
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
                activeSessionId: partial.session_id ?? s.activeSessionId,
              };
            });
          }

          // Handle content_block_start for tool_use
          if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
            const block = evt.content_block;
            const blockIndex = evt.index ?? -1;
            // Start tracking streaming input for file-edit tools
            if (block.name && FILE_EDIT_TOOLS.has(block.name) && blockIndex >= 0) {
              streamingToolInputs.set(blockIndex, {
                toolName: block.name,
                chunks: [],
                lastFlushAt: Date.now(),
                filePath: null,
              });
            }
            set((s) => ({
              messages: [
                ...s.messages,
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

          // Handle input_json_delta — accumulate partial tool input for streaming edits
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta' && evt.delta.partial_json) {
            const blockIndex = evt.index ?? -1;
            const tracker = streamingToolInputs.get(blockIndex);
            if (tracker) {
              tracker.chunks.push(evt.delta.partial_json);
              const now = Date.now();
              // Throttle: flush to editor every STREAMING_EDIT_FLUSH_INTERVAL ms
              if (now - tracker.lastFlushAt >= STREAMING_EDIT_FLUSH_INTERVAL) {
                tracker.lastFlushAt = now;
                const parsed = tryParsePartialJson(tracker.chunks);
                if (parsed) {
                  // Extract file path early for UI display
                  const fp = extractFilePath(parsed);
                  if (fp) tracker.filePath = fp;
                  // For Write tools, stream partial content to editor
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

          // Handle content_block_stop — finalize streaming tool input
          if (evt.type === 'content_block_stop') {
            const blockIndex = evt.index ?? -1;
            const tracker = streamingToolInputs.get(blockIndex);
            if (tracker) {
              streamingToolInputs.delete(blockIndex);
              // Parse final accumulated JSON and forward to editor as final diff
              const parsed = tryParsePartialJson(tracker.chunks);
              if (parsed && tracker.filePath) {
                void forwardToolToEditor(
                  { name: tracker.toolName, input: parsed },
                  'final',
                );
              }
            }
          }

          return;
        }

        // ---- Tool progress (elapsed time updates) ----
        if (data.type === 'tool_progress') {
          const progress = data as SdkToolProgressMessage;
          set((s) => {
            // Find the last tool message with matching name and update its content
            const idx = s.messages.findLastIndex(
              (m) => m.role === 'tool' && m.toolName === progress.tool_name && m.isStreaming,
            );
            if (idx < 0) return s;
            const nextMessages: ChatMessage[] = s.messages.slice();
            const existing = nextMessages[idx];
            nextMessages[idx] = {
              ...existing,
              content: `Running ${progress.tool_name}... (${Math.round(progress.elapsed_time_seconds)}s)`,
            } as ChatMessage;
            return { messages: nextMessages };
          });
          return;
        }

        if (data.type === 'system') {
          const sys = data as SdkSystemMessage;
          if (sys.session_id) {
            const sid = sys.session_id;
            set((s) => {
              const prev = s.sessionStats[sid] ?? emptyStats(sid);
              // Insert a thinking placeholder if no streaming assistant message yet
              const hasStreamingAssistant = s.streamingMessageId !== null;
              const shouldInsertThinking = !hasStreamingAssistant && s.isStreaming;
              const thinkingId = shouldInsertThinking ? nextId('a') : null;
              return {
                activeSessionId: sid,
                messages: shouldInsertThinking
                  ? [...s.messages, {
                      id: thinkingId!,
                      role: 'assistant' as const,
                      kind: 'text' as const,
                      content: '',
                      timestamp: Date.now(),
                      isStreaming: true,
                    }]
                  : s.messages,
                streamingMessageId: thinkingId ?? s.streamingMessageId,
                streamingChunks: shouldInsertThinking ? [] : s.streamingChunks,
                sessionStats: {
                  ...s.sessionStats,
                  [sid]: {
                    ...prev,
                    model: sys.model ?? prev.model,
                    lastUpdated: Date.now(),
                  },
                },
              };
            });
          }
          return;
        }

        if (data.type === 'assistant') {
          const asst = data as SdkAssistantMessage;
          const { text, tools } = extractContent(asst.message?.content);
          const extractor = ensureExtractor(asst.session_id ?? 'stream');
          // Only feed extractor if stream_event didn't already provide per-token text.
          // Check: if we have a streaming message, stream_event already fed the extractor.
          const alreadyStreamedViaDeltas = (() => {
            const s = useClaudeStore.getState();
            return s.streamingMessageId !== null;
          })();
          if (!alreadyStreamedViaDeltas) {
            if (text) extractor.feedText(text);
          }
          for (const tool of tools) {
            extractor.feedToolUse(tool);
          }
          // Ingest Write/Edit/MultiEdit tool_use blocks into the artifact
          // gallery so any file Claude writes — not just `.html` — shows up
          // in "Generated Content" regardless of whether it was ever printed
          // inline as a fenced code block. See FR-1008.
          {
            const artifactStore = useArtifactStore.getState();
            const toolSessionId = asst.session_id ?? null;
            for (const tool of tools) {
              artifactStore.ingestToolUse(nextId('tool'), toolSessionId, tool);
            }
          }
          // Forward Write/Edit/MultiEdit results to editor as final diffs.
          // If content_block_stop already handled this, applyClaudeEdit will
          // simply recompute identical hunks (idempotent).
          for (const tool of tools) {
            if (FILE_EDIT_TOOLS.has(tool.name)) {
              void forwardToolToEditor(tool, 'final');
            }
          }
          let newAssistantMessageId: string | null = null;
          set((s) => {
            const prev = s.messages;
            const last = prev[prev.length - 1];
            const hasStreamingAssistant =
              last && last.role === 'assistant' && last.kind === 'text' && last.isStreaming;

            const nextMessages = prev.slice();
            let nextChunks = s.streamingChunks;
            let nextStreamingId = s.streamingMessageId;

            if (text) {
              if (hasStreamingAssistant) {
                // Replace streaming message content with authoritative SDK text
                const updated: ChatMessage = { ...last, content: text, timestamp: Date.now() };
                nextMessages[nextMessages.length - 1] = updated;
                newAssistantMessageId = updated.id;
                nextChunks = [text];
              } else {
                // No stream_event deltas preceded this — create new message
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

            // Finalize any streaming tool_use messages and add authoritative tool blocks
            for (const tool of tools) {
              // Check if a streaming tool message already exists for this tool
              const existingIdx = nextMessages.findLastIndex(
                (m) => m.role === 'tool' && m.toolName === tool.name && m.isStreaming,
              );
              if (existingIdx >= 0) {
                // Update existing streaming tool message with final input
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

            return {
              messages: nextMessages,
              streamingChunks: nextChunks,
              streamingMessageId: nextStreamingId,
              activeSessionId: asst.session_id ?? s.activeSessionId,
            };
          });
          if (text && newAssistantMessageId) {
            useArtifactStore
              .getState()
              .extractFromMessage(newAssistantMessageId, asst.session_id ?? null, text);
          }
          return;
        }

        if (data.type === 'user') {
          // Tool result messages — omit from chat UI
          return;
        }
        return;
      }

      case 'tool_call': {
        // Legacy path (unused with current handler): ignore
        return;
      }

      case 'permission_request': {
        set({ pendingPermission: msg });
        return;
      }

      case 'auto_decision': {
        const label =
          msg.decision === 'allow'
            ? `Auto-allowed ${msg.tool} (persistent rule)`
            : `Auto-denied ${msg.tool} (persistent rule)`;
        set((s) => ({
          messages: [
            ...s.messages,
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
        return;
      }

      case 'result': {
        const m = msg as { data: SdkResultMessage };
        const data = m.data;
        finalizeExtractor();
        useArtifactStore.getState().flushPendingOpen();
        set((s) => {
          const nextMessages = s.messages.map((m) =>
            m.isStreaming ? { ...m, isStreaming: false } : m,
          );
          if (data.subtype === 'success' && typeof data.result === 'string' && data.result.trim()) {
            const last = nextMessages[nextMessages.length - 1];
            if (!last || last.role !== 'assistant' || last.content !== data.result) {
              // result field contains the final assistant text; avoid duplicates
            }
          }
          const sid = data.session_id ?? s.activeSessionId;
          const nextStats = { ...s.sessionStats };
          if (sid) {
            const prev = nextStats[sid] ?? emptyStats(sid);
            const mu = pickModelUsage(data.modelUsage, prev.model);
            const ctxTokens = mu
              ? (mu.inputTokens ?? 0) +
                (mu.cacheReadInputTokens ?? 0) +
                (mu.cacheCreationInputTokens ?? 0)
              : null;
            nextStats[sid] = {
              ...prev,
              numTurns: data.num_turns ?? prev.numTurns,
              durationMs: data.duration_ms ?? prev.durationMs,
              inputTokens: prev.inputTokens + (data.usage?.input_tokens ?? 0),
              outputTokens: prev.outputTokens + (data.usage?.output_tokens ?? 0),
              cacheReadTokens:
                prev.cacheReadTokens + (data.usage?.cache_read_input_tokens ?? 0),
              costUsd: prev.costUsd + (data.total_cost_usd ?? 0),
              lastUpdated: Date.now(),
              lastContextTokens: ctxTokens ?? prev.lastContextTokens,
              contextWindow: mu?.contextWindow ?? prev.contextWindow,
            };
          }
          return {
            messages: nextMessages,
            streamingChunks: [],
            streamingMessageId: null,
            isStreaming: false,
            activeSessionId: sid,
            totalCost: s.totalCost + (data.total_cost_usd || 0),
            tokenUsage: {
              input: s.tokenUsage.input + (data.usage?.input_tokens || 0),
              output: s.tokenUsage.output + (data.usage?.output_tokens || 0),
            },
            currentRequestId: null,
            sessionStats: nextStats,
          };
        });
        return;
      }

      case 'error': {
        finalizeExtractor();
        useArtifactStore.getState().flushPendingOpen();
        set((s) => ({
          isStreaming: false,
          streamingChunks: [],
          streamingMessageId: null,
          messages: [
            ...s.messages.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
            {
              id: nextId('e'),
              role: 'assistant',
              kind: 'error',
              content: `Error: ${msg.message}`,
              timestamp: Date.now(),
            },
          ],
        }));
        return;
      }
    }
  },

  setPendingPermission: (req) => set({ pendingPermission: req }),
  reset: () =>
    set({
      messages: [],
      streamingChunks: [],
      streamingMessageId: null,
      isStreaming: false,
      activeSessionId: null,
      pendingPermission: null,
      totalCost: 0,
      tokenUsage: { input: 0, output: 0 },
      currentRequestId: null,
      sessionStats: {},
      messageFilter: new Set<MessageKind>(ALL_MESSAGE_KINDS),
    }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setCurrentRequestId: (id) => set({ currentRequestId: id }),
  toggleFilter: (kind) =>
    set((s) => {
      const next = new Set(s.messageFilter);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return { messageFilter: next };
    }),

  loadSession: async (id) => {
    try {
      const detail = await sessionsApi.get(id);
      const history: SessionHistoryMessage[] = detail.history ?? [];
      const messages: ChatMessage[] = history.map((m) => ({
        id: m.id,
        role: m.role,
        kind: (m.role === 'tool' ? 'tool_use' : 'text') as MessageKind,
        content: m.content,
        timestamp: m.timestamp,
        toolName: m.toolName,
      }));
      const artifactStore = useArtifactStore.getState();
      for (const m of messages) {
        if (m.role === 'assistant' && m.content) {
          artifactStore.extractFromMessage(m.id, id, m.content, { silent: true });
        }
      }
      set((s) => {
        const prev = s.sessionStats[id] ?? emptyStats(id);
        return {
          messages,
          activeSessionId: id,
          totalCost: detail.totalCost ?? 0,
          tokenUsage: { input: 0, output: 0 },
          isStreaming: false,
          pendingPermission: null,
          currentRequestId: null,
          sessionStats: {
            ...s.sessionStats,
            [id]: {
              ...prev,
              costUsd: detail.totalCost ?? prev.costUsd,
              lastUpdated: Date.now(),
            },
          },
        };
      });
    } catch (err) {
      console.error('[claude-store] loadSession failed', err);
    }
  },
}));
