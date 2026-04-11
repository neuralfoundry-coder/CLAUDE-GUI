'use client';

import { create } from 'zustand';
import type { ClaudeServerMessage } from '@/types/websocket';
import { sessionsApi, type SessionHistoryMessage } from '@/lib/api-client';
import { HtmlStreamExtractor } from '@/lib/claude/html-stream-extractor';
import { useLivePreviewStore } from '@/stores/use-live-preview-store';
import { useArtifactStore } from '@/stores/use-artifact-store';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: number;
  toolName?: string;
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

interface ClaudeState {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeSessionId: string | null;
  pendingPermission: Extract<ClaudeServerMessage, { type: 'permission_request' }> | null;
  totalCost: number;
  tokenUsage: { input: number; output: number };
  currentRequestId: string | null;
  sessionStats: Record<string, SessionStats>;

  pushUserMessage: (content: string) => string;
  handleServerMessage: (msg: ClaudeServerMessage) => void;
  setPendingPermission: (req: Extract<ClaudeServerMessage, { type: 'permission_request' }> | null) => void;
  reset: () => void;
  setActiveSessionId: (id: string | null) => void;
  setStreaming: (streaming: boolean) => void;
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

let currentExtractor: HtmlStreamExtractor | null = null;

async function fetchHtmlFile(filePath: string): Promise<string | null> {
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

function ensureExtractor(streamId: string): HtmlStreamExtractor {
  if (currentExtractor) return currentExtractor;
  const live = useLivePreviewStore.getState();
  live.startStream(streamId);
  currentExtractor = new HtmlStreamExtractor({
    onChunk: (html, meta) => {
      useLivePreviewStore.getState().appendChunk(html, meta.renderable);
    },
    onWritePath: (filePath) => {
      useLivePreviewStore.getState().setGeneratedFilePath(filePath);
    },
    onNeedBaseline: (filePath, apply) => {
      void fetchHtmlFile(filePath).then((content) => {
        if (content) apply(content);
      });
    },
  });
  // Seed the extractor with the previous render so Edit/MultiEdit in a
  // follow-up stream can patch the last known full HTML instead of
  // overwriting it with only the replacement snippet.
  const existing = useLivePreviewStore.getState().buffer;
  if (existing) currentExtractor.seedBaseline(existing);
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
  isStreaming: false,
  activeSessionId: null,
  pendingPermission: null,
  totalCost: 0,
  tokenUsage: { input: 0, output: 0 },
  currentRequestId: null,
  sessionStats: {},

  pushUserMessage: (content) => {
    const id = nextId('u');
    set((s) => ({
      messages: [...s.messages, { id, role: 'user', content, timestamp: Date.now() }],
    }));
    return id;
  },

  handleServerMessage: (msg) => {
    switch (msg.type) {
      case 'message': {
        const data = (msg as { data: SdkAssistantMessage | SdkUserMessage | SdkSystemMessage }).data;

        if (data.type === 'system') {
          const sys = data as SdkSystemMessage;
          if (sys.session_id) {
            const sid = sys.session_id;
            set((s) => {
              const prev = s.sessionStats[sid] ?? emptyStats(sid);
              return {
                activeSessionId: sid,
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
          if (text) extractor.feedText(text);
          for (const tool of tools) {
            extractor.feedToolUse(tool);
          }
          let newAssistantMessageId: string | null = null;
          set((s) => {
            const nextMessages = [...s.messages];
            if (text) {
              newAssistantMessageId = nextId('a');
              nextMessages.push({
                id: newAssistantMessageId,
                role: 'assistant',
                content: text,
                timestamp: Date.now(),
              });
            }
            for (const tool of tools) {
              nextMessages.push({
                id: nextId('t'),
                role: 'tool',
                content: JSON.stringify(tool.input).slice(0, 300),
                toolName: tool.name,
                timestamp: Date.now(),
              });
            }
            return {
              messages: nextMessages,
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
          const nextMessages = [...s.messages];
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
        set((s) => ({
          isStreaming: false,
          messages: [
            ...s.messages,
            {
              id: nextId('e'),
              role: 'assistant',
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
      isStreaming: false,
      activeSessionId: null,
      pendingPermission: null,
      totalCost: 0,
      tokenUsage: { input: 0, output: 0 },
      currentRequestId: null,
      sessionStats: {},
    }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),

  loadSession: async (id) => {
    try {
      const detail = await sessionsApi.get(id);
      const history: SessionHistoryMessage[] = detail.history ?? [];
      const messages: ChatMessage[] = history.map((m) => ({
        id: m.id,
        role: m.role,
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
