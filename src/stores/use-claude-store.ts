'use client';

import { create } from 'zustand';
import type { ClaudeServerMessage } from '@/types/websocket';
import { sessionsApi, type SessionHistoryMessage } from '@/lib/api-client';
import { UniversalStreamExtractor } from '@/lib/claude/universal-stream-extractor';
import { useLivePreviewStore } from '@/stores/use-live-preview-store';
import { useArtifactStore } from '@/stores/use-artifact-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { useSplitLayoutStore } from '@/stores/use-split-layout-store';
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

// ── Tab types ──

export interface ClaudeTab {
  id: string;
  name: string;
  createdAt: number;
  sessionId: string | null;
  customName: boolean;
}

export interface ClaudeTabState {
  messages: ChatMessage[];
  streamingChunks: string[];
  streamingMessageId: string | null;
  isStreaming: boolean;
  pendingPermission: Extract<ClaudeServerMessage, { type: 'permission_request' }> | null;
  currentRequestId: string | null;
  messageFilter: Set<MessageKind>;
}

const ALL_MESSAGE_KINDS: MessageKind[] = ['text', 'tool_use', 'tool_result', 'system', 'error', 'auto_decision'];

function emptyTabState(): ClaudeTabState {
  return {
    messages: [],
    streamingChunks: [],
    streamingMessageId: null,
    isStreaming: false,
    pendingPermission: null,
    currentRequestId: null,
    messageFilter: new Set<MessageKind>(ALL_MESSAGE_KINDS),
  };
}

// ── SDK message types ──

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

// ── Store interface ──

interface ClaudeState {
  // Tab management
  tabs: ClaudeTab[];
  activeTabId: string | null;
  tabStates: Record<string, ClaudeTabState>;

  // Global state (shared across tabs)
  totalCost: number;
  tokenUsage: { input: number; output: number };
  sessionStats: Record<string, SessionStats>;

  // Tab actions
  createTab: (opts?: { name?: string; sessionId?: string | null }) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => void;
  reorderTab: (fromIndex: number, toIndex: number) => void;

  // Per-tab message/streaming actions (operate on active tab)
  pushUserMessage: (content: string) => string;
  handleServerMessage: (msg: ClaudeServerMessage) => void;
  setPendingPermission: (req: Extract<ClaudeServerMessage, { type: 'permission_request' }> | null) => void;
  resetActiveTab: () => void;
  setStreaming: (streaming: boolean) => void;
  setCurrentRequestId: (id: string | null) => void;
  toggleFilter: (kind: MessageKind) => void;
  loadSession: (id: string) => Promise<void>;

  // Backward compat aliases
  /** @deprecated Use activeTab's sessionId instead */
  activeSessionId: string | null;
  /** @deprecated Use tabStates[activeTabId].messages */
  messages: ChatMessage[];
  /** @deprecated Use tabStates[activeTabId].isStreaming */
  isStreaming: boolean;
  /** @deprecated Use tabStates[activeTabId].pendingPermission */
  pendingPermission: Extract<ClaudeServerMessage, { type: 'permission_request' }> | null;
  /** @deprecated Use tabStates[activeTabId].currentRequestId */
  currentRequestId: string | null;
  /** @deprecated Use tabStates[activeTabId].messageFilter */
  messageFilter: Set<MessageKind>;

  /** @deprecated Use resetActiveTab() */
  reset: () => void;
  /** @deprecated Tab's sessionId is set automatically */
  setActiveSessionId: (id: string | null) => void;
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

let tabCounter = 0;
function nextTabId(): string {
  tabCounter += 1;
  return `claude-tab-${Date.now()}-${tabCounter}`;
}

// Per-tab extractors and streaming tool inputs
const perTabExtractors = new Map<string, UniversalStreamExtractor>();
const perTabStreamingToolInputs = new Map<string, Map<number, StreamingToolInput>>();

/**
 * Maps requestId → tabId so server responses can be routed to the tab
 * that originated the request, even before session_id is assigned.
 * Entries are added when setCurrentRequestId is called and removed
 * on result/error or when the tab is closed.
 */
const requestToTabMap = new Map<string, string>();

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
const STREAMING_EDIT_FLUSH_INTERVAL = 500; // ms

function tryParsePartialJson(chunks: string[]): Record<string, unknown> | null {
  const raw = chunks.join('');
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch { /* not parseable yet */ }
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
  const { isPanelCollapsed, setPanelCollapsedByType } = useSplitLayoutStore.getState();

  if (isPanelCollapsed('editor')) {
    setPanelCollapsedByType('editor', false);
  }

  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const PREVIEWABLE_EXTS = new Set(['html', 'htm', 'svg', 'md', 'markdown']);
  if (PREVIEWABLE_EXTS.has(ext) && isPanelCollapsed('preview')) {
    setPanelCollapsedByType('preview', false);
  }

  const existingTab = editorStore.tabs.find((t) => t.path === filePath);
  if (!existingTab) {
    await editorStore.openFile(filePath);
  }

  let modified: string | undefined;
  if (tool.name === 'Write') {
    modified = typeof input.content === 'string' ? input.content : undefined;
  } else {
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

function getStreamingToolInputs(tabId: string): Map<number, StreamingToolInput> {
  let map = perTabStreamingToolInputs.get(tabId);
  if (!map) {
    map = new Map();
    perTabStreamingToolInputs.set(tabId, map);
  }
  return map;
}

function ensureExtractor(tabId: string, streamId: string): UniversalStreamExtractor {
  const existing = perTabExtractors.get(tabId);
  if (existing) return existing;

  const live = useLivePreviewStore.getState();
  live.startStream(streamId);

  const extractor = new UniversalStreamExtractor({
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

  const pages = useLivePreviewStore.getState().pages;
  for (const page of pages) {
    if (page.filePath && page.content) {
      extractor.seedBaseline(page.filePath, page.content);
    }
  }

  perTabExtractors.set(tabId, extractor);
  return extractor;
}

function finalizeExtractor(tabId: string): void {
  const extractor = perTabExtractors.get(tabId);
  if (!extractor) return;
  extractor.finalize();
  perTabExtractors.delete(tabId);
  perTabStreamingToolInputs.delete(tabId);
  useLivePreviewStore.getState().finalize();
}

// ── Helper: get active tab state from store state (non-reactive) ──

function updateTabState(
  s: ClaudeState,
  tabId: string,
  updater: (ts: ClaudeTabState) => Partial<ClaudeTabState>,
): Partial<ClaudeState> {
  const ts = s.tabStates[tabId] ?? emptyTabState();
  const patch = updater(ts);
  const nextTs = { ...ts, ...patch };
  return {
    tabStates: { ...s.tabStates, [tabId]: nextTs },
    // Backward compat: if this is the active tab, mirror to top-level
    ...(tabId === s.activeTabId ? derivedFromTab(nextTs) : {}),
  };
}

/** Derive backward-compat top-level fields from active tab state.
 *  NOTE: Does NOT set activeSessionId — use assignSessionToTab or set it explicitly. */
function derivedFromTab(
  ts: ClaudeTabState,
): Partial<ClaudeState> {
  return {
    messages: ts.messages,
    isStreaming: ts.isStreaming,
    pendingPermission: ts.pendingPermission,
    currentRequestId: ts.currentRequestId,
    messageFilter: ts.messageFilter,
  };
}

/** Derive all backward-compat fields when switching active tab (including activeSessionId). */
function derivedFromActiveTab(s: ClaudeState, tabId: string): Partial<ClaudeState> {
  const ts = s.tabStates[tabId] ?? emptyTabState();
  const tab = s.tabs.find((t) => t.id === tabId);
  return {
    ...derivedFromTab(ts),
    activeSessionId: tab?.sessionId ?? null,
  };
}

// ── Initial tab ──

const initialTabId = nextTabId();
const initialTab: ClaudeTab = {
  id: initialTabId,
  name: 'Chat 1',
  createdAt: Date.now(),
  sessionId: null,
  customName: false,
};

// ── Create store ──

export const useClaudeStore = create<ClaudeState>((set) => ({
  // Tab state
  tabs: [initialTab],
  activeTabId: initialTabId,
  tabStates: { [initialTabId]: emptyTabState() },

  // Global state
  totalCost: 0,
  tokenUsage: { input: 0, output: 0 },
  sessionStats: {},

  // Backward-compat derived (from initial empty tab)
  messages: [],
  streamingChunks: [],
  streamingMessageId: null,
  isStreaming: false,
  activeSessionId: null,
  pendingPermission: null,
  currentRequestId: null,
  messageFilter: new Set<MessageKind>(ALL_MESSAGE_KINDS),

  // ── Tab actions ──

  createTab: (opts) => {
    const id = nextTabId();
    const existingCount = useClaudeStore.getState().tabs.length;
    const name = opts?.name ?? `Chat ${existingCount + 1}`;
    const tab: ClaudeTab = {
      id,
      name,
      createdAt: Date.now(),
      sessionId: opts?.sessionId ?? null,
      customName: !!opts?.name,
    };
    set((s) => {
      const ts = emptyTabState();
      return {
        tabs: [...s.tabs, tab],
        activeTabId: id,
        tabStates: { ...s.tabStates, [id]: ts },
        ...derivedFromTab(ts),
        activeSessionId: tab.sessionId ?? null,
      };
    });
    return id;
  },

  closeTab: (tabId) => {
    set((s) => {
      // Abort streaming if active
      const ts = s.tabStates[tabId];
      if (ts?.isStreaming && ts.currentRequestId) {
        // Import getClaudeClient lazily to avoid circular deps
        import('@/lib/websocket/claude-client').then(({ getClaudeClient }) => {
          getClaudeClient().abort(ts.currentRequestId!);
        });
      }

      // Clean up request → tab mapping
      if (ts?.currentRequestId) {
        requestToTabMap.delete(ts.currentRequestId);
      }

      const nextTabs = s.tabs.filter((t) => t.id !== tabId);
      const nextTabStates = { ...s.tabStates };
      delete nextTabStates[tabId];

      // Clean up per-tab extractors
      finalizeExtractor(tabId);

      // If closing last tab, create a new one
      if (nextTabs.length === 0) {
        const newId = nextTabId();
        const newTab: ClaudeTab = {
          id: newId,
          name: 'Chat 1',
          createdAt: Date.now(),
          sessionId: null,
          customName: false,
        };
        const newTs = emptyTabState();
        return {
          tabs: [newTab],
          activeTabId: newId,
          tabStates: { [newId]: newTs },
          ...derivedFromTab(newTs),
          activeSessionId: null,
        };
      }

      // If closing the active tab, switch to adjacent tab
      let nextActiveId = s.activeTabId;
      if (s.activeTabId === tabId) {
        const closedIdx = s.tabs.findIndex((t) => t.id === tabId);
        const newIdx = Math.min(closedIdx, nextTabs.length - 1);
        nextActiveId = nextTabs[newIdx]!.id;
      }

      return {
        tabs: nextTabs,
        activeTabId: nextActiveId,
        tabStates: nextTabStates,
        ...derivedFromActiveTab({ ...s, tabs: nextTabs, tabStates: nextTabStates }, nextActiveId!),
      };
    });
  },

  setActiveTab: (tabId) => {
    set((s) => {
      if (s.activeTabId === tabId) return s;
      return {
        activeTabId: tabId,
        ...derivedFromActiveTab(s, tabId),
      };
    });
  },

  renameTab: (tabId, name) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, name, customName: true } : t,
      ),
    }));
  },

  reorderTab: (fromIndex, toIndex) => {
    set((s) => {
      if (fromIndex === toIndex) return s;
      if (fromIndex < 0 || fromIndex >= s.tabs.length) return s;
      if (toIndex < 0 || toIndex >= s.tabs.length) return s;
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved!);
      return { tabs };
    });
  },

  // ── Per-tab message/streaming actions ──

  pushUserMessage: (content) => {
    const id = nextId('u');
    set((s) => {
      const tabId = s.activeTabId;
      if (!tabId) return s;

      // Auto-rename tab from first user message
      let nextTabs = s.tabs;
      const tab = s.tabs.find((t) => t.id === tabId);
      const ts = s.tabStates[tabId] ?? emptyTabState();
      if (tab && !tab.customName && ts.messages.filter((m) => m.role === 'user').length === 0) {
        const truncated = content.length > 30 ? content.slice(0, 30) + '...' : content;
        nextTabs = s.tabs.map((t) =>
          t.id === tabId ? { ...t, name: truncated } : t,
        );
      }

      return {
        tabs: nextTabs,
        ...updateTabState(s, tabId, (ts) => ({
          messages: [...ts.messages, { id, role: 'user', kind: 'text', content, timestamp: Date.now() }],
        })),
      };
    });
    return id;
  },

  handleServerMessage: (msg) => {
    // Extract session_id and requestId from the message to route to the correct tab
    const sessionId = extractSessionId(msg);
    const reqId = extractRequestId(msg);

    switch (msg.type) {
      case 'message': {
        const data = (msg as { data: SdkAssistantMessage | SdkUserMessage | SdkSystemMessage | SdkPartialAssistantMessage | SdkToolProgressMessage }).data;

        // ---- Per-token streaming via stream_event ----
        if (data.type === 'stream_event') {
          const partial = data as SdkPartialAssistantMessage;
          const evt = partial.event;

          set((s) => {
            const tabId = resolveTabId(s, partial.session_id, reqId);
            if (!tabId) return s;

            // Handle text deltas (per-token)
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
              const deltaText = evt.delta.text;
              const extractor = ensureExtractor(tabId, partial.session_id ?? 'stream');
              extractor.feedText(deltaText);

              const ts = s.tabStates[tabId] ?? emptyTabState();
              const prev = ts.messages;
              const last = prev[prev.length - 1];

              if (last && last.role === 'assistant' && last.kind === 'text' && last.isStreaming) {
                const chunks = ts.streamingChunks;
                chunks.push(deltaText);
                const content = chunks.join('');
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

            // Handle content_block_start for tool_use
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

            // Handle input_json_delta
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

            // Handle content_block_stop
            if (evt.type === 'content_block_stop') {
              const blockIndex = evt.index ?? -1;
              const toolInputs = getStreamingToolInputs(tabId);
              const tracker = toolInputs.get(blockIndex);
              if (tracker) {
                toolInputs.delete(blockIndex);
                const parsed = tryParsePartialJson(tracker.chunks);
                if (parsed && tracker.filePath) {
                  void forwardToolToEditor(
                    { name: tracker.toolName, input: parsed },
                    'final',
                  );
                }
              }
            }

            return s;
          });
          return;
        }

        // ---- Tool progress (elapsed time updates) ----
        if (data.type === 'tool_progress') {
          const progress = data as SdkToolProgressMessage;
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
          return;
        }

        if (data.type === 'system') {
          const sys = data as SdkSystemMessage;
          if (sys.session_id) {
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
                    ? [...ts.messages, {
                        id: thinkingId!,
                        role: 'assistant' as const,
                        kind: 'text' as const,
                        content: '',
                        timestamp: Date.now(),
                        isStreaming: true,
                      }]
                    : ts.messages,
                  streamingMessageId: thinkingId ?? ts.streamingMessageId,
                  streamingChunks: shouldInsertThinking ? [] : ts.streamingChunks,
                })),
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
          set((s) => {
            const tabId = resolveTabId(s, asst.session_id, reqId);
            if (!tabId) return s;
            const extractor = ensureExtractor(tabId, asst.session_id ?? 'stream');
            const ts = s.tabStates[tabId] ?? emptyTabState();
            const alreadyStreamedViaDeltas = ts.streamingMessageId !== null;
            if (!alreadyStreamedViaDeltas) {
              if (text) extractor.feedText(text);
            }
            for (const tool of tools) {
              extractor.feedToolUse(tool);
            }
            {
              const artifactStore = useArtifactStore.getState();
              const toolSessionId = asst.session_id ?? null;
              for (const tool of tools) {
                artifactStore.ingestToolUse(nextId('tool'), toolSessionId, tool);
              }
            }
            for (const tool of tools) {
              if (FILE_EDIT_TOOLS.has(tool.name)) {
                void forwardToolToEditor(tool, 'final');
              }
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
              useArtifactStore
                .getState()
                .extractFromMessage(newAssistantMessageId, asst.session_id ?? null, text);
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
          return;
        }

        if (data.type === 'user') {
          return;
        }
        return;
      }

      case 'tool_call': {
        return;
      }

      case 'permission_request': {
        set((s) => {
          const tabId = s.activeTabId;
          if (!tabId) return { pendingPermission: msg };
          return updateTabState(s, tabId, () => ({
            pendingPermission: msg,
          }));
        });
        return;
      }

      case 'auto_decision': {
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
        return;
      }

      case 'result': {
        const m = msg as { data: SdkResultMessage };
        const data = m.data;
        // Clean up request → tab mapping since the request is complete
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
          if (data.subtype === 'success' && typeof data.result === 'string' && data.result.trim()) {
            const last = nextMessages[nextMessages.length - 1];
            if (!last || last.role !== 'assistant' || last.content !== data.result) {
              // result field contains the final assistant text; avoid duplicates
            }
          }
          const sid = data.session_id ?? s.tabs.find((t) => t.id === tabId)?.sessionId;
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
        return;
      }

      case 'error': {
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
        return;
      }
    }
  },

  setPendingPermission: (req) => {
    set((s) => {
      const tabId = s.activeTabId;
      if (!tabId) return { pendingPermission: req };
      return updateTabState(s, tabId, () => ({ pendingPermission: req }));
    });
  },

  resetActiveTab: () => {
    set((s) => {
      const tabId = s.activeTabId;
      if (!tabId) return s;
      finalizeExtractor(tabId);
      const ts = emptyTabState();
      return {
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, sessionId: null, customName: false, name: t.name } : t,
        ),
        tabStates: { ...s.tabStates, [tabId]: ts },
        ...derivedFromTab(ts),
        activeSessionId: null,
      };
    });
  },

  // Backward-compat: reset() calls resetActiveTab() and clears global counters
  reset: () => {
    const store = useClaudeStore.getState();
    store.resetActiveTab();
    useClaudeStore.setState({
      totalCost: 0,
      tokenUsage: { input: 0, output: 0 },
      sessionStats: {},
    });
  },

  setActiveSessionId: (id) => {
    set((s) => {
      const tabId = s.activeTabId;
      if (!tabId) return { activeSessionId: id };
      return {
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, sessionId: id } : t,
        ),
        activeSessionId: id,
      };
    });
  },

  setStreaming: (streaming) => {
    set((s) => {
      const tabId = s.activeTabId;
      if (!tabId) return { isStreaming: streaming };
      return updateTabState(s, tabId, () => ({ isStreaming: streaming }));
    });
  },

  setCurrentRequestId: (id) => {
    set((s) => {
      const tabId = s.activeTabId;
      if (!tabId) return { currentRequestId: id };
      // Track requestId → tabId so server responses route to the originating tab
      if (id) {
        requestToTabMap.set(id, tabId);
      }
      return updateTabState(s, tabId, (ts) => {
        // Clean up old mapping when replacing request
        if (ts.currentRequestId && ts.currentRequestId !== id) {
          requestToTabMap.delete(ts.currentRequestId);
        }
        return { currentRequestId: id };
      });
    });
  },

  toggleFilter: (kind) => {
    set((s) => {
      const tabId = s.activeTabId;
      if (!tabId) return s;
      const ts = s.tabStates[tabId] ?? emptyTabState();
      const next = new Set(ts.messageFilter);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return updateTabState(s, tabId, () => ({ messageFilter: next }));
    });
  },

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
        const tabId = s.activeTabId;
        if (!tabId) return s;
        const prev = s.sessionStats[id] ?? emptyStats(id);
        const ts: ClaudeTabState = {
          messages,
          streamingChunks: [],
          streamingMessageId: null,
          isStreaming: false,
          pendingPermission: null,
          currentRequestId: null,
          messageFilter: new Set<MessageKind>(ALL_MESSAGE_KINDS),
        };
        const nextTabs = s.tabs.map((t) =>
          t.id === tabId ? { ...t, sessionId: id } : t,
        );
        return {
          tabs: nextTabs,
          tabStates: { ...s.tabStates, [tabId]: ts },
          ...derivedFromTab(ts),
          activeSessionId: id,
          totalCost: detail.totalCost ?? 0,
          tokenUsage: { input: 0, output: 0 },
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

// ── Helpers for routing messages to the correct tab ──

function extractSessionId(msg: ClaudeServerMessage): string | undefined {
  // Try common patterns from server messages
  const data = (msg as { data?: { session_id?: string } }).data;
  if (data?.session_id) return data.session_id;
  const msgAny = msg as { session_id?: string };
  return msgAny.session_id;
}

function extractRequestId(msg: ClaudeServerMessage): string | undefined {
  return (msg as { requestId?: string }).requestId;
}

/**
 * Resolve which tab should receive a message.
 * Priority:
 *   1. Tab that owns the session_id (already assigned)
 *   2. Tab that initiated the requestId (before session_id assignment)
 *   3. Active tab (last resort)
 */
function resolveTabId(
  s: ClaudeState,
  sessionId: string | undefined | null,
  requestId?: string | undefined,
): string | null {
  // 1. Match by session_id
  if (sessionId) {
    const tab = s.tabs.find((t) => t.sessionId === sessionId);
    if (tab) return tab.id;
  }
  // 2. Match by requestId → tabId mapping (set when query was sent)
  if (requestId) {
    const tabId = requestToTabMap.get(requestId);
    if (tabId && s.tabStates[tabId]) return tabId;
  }
  // 3. Fall back to active tab
  return s.activeTabId;
}

/**
 * If a tab doesn't have a sessionId yet, assign it from the server response.
 * Returns partial state to merge.
 */
function assignSessionToTab(
  s: ClaudeState,
  tabId: string,
  sessionId: string | undefined | null,
): Partial<ClaudeState> {
  if (!sessionId) return {};
  const tab = s.tabs.find((t) => t.id === tabId);
  if (!tab || tab.sessionId === sessionId) return {};
  // Only assign if the tab doesn't have a session yet
  if (tab.sessionId && tab.sessionId !== sessionId) return {};
  return {
    tabs: s.tabs.map((t) =>
      t.id === tabId ? { ...t, sessionId } : t,
    ),
    // Update backward-compat field if this is the active tab
    ...(tabId === s.activeTabId ? { activeSessionId: sessionId } : {}),
  };
}

// ── Convenience hooks for tab-aware selectors ──

export function useActiveTabMessages(): ChatMessage[] {
  return useClaudeStore((s) => {
    const tabId = s.activeTabId;
    return tabId ? (s.tabStates[tabId]?.messages ?? []) : [];
  });
}

export function useActiveTabStreaming(): boolean {
  return useClaudeStore((s) => {
    const tabId = s.activeTabId;
    return tabId ? (s.tabStates[tabId]?.isStreaming ?? false) : false;
  });
}

export function useActiveTabSessionId(): string | null {
  return useClaudeStore((s) => {
    const tabId = s.activeTabId;
    if (!tabId) return null;
    const tab = s.tabs.find((t) => t.id === tabId);
    return tab?.sessionId ?? null;
  });
}
