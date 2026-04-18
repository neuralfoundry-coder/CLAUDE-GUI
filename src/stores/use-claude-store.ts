'use client';

import { create } from 'zustand';
import type { ClaudeServerMessage } from '@/types/websocket';
import { sessionsApi, type SessionHistoryMessage } from '@/lib/api-client';
import { useArtifactStore } from '@/stores/use-artifact-store';
import { abortRequest } from '@/lib/claude/request-aborter';
import type {
  ChatMessage,
  ClaudeTab,
  ClaudeTabState,
  MessageKind,
  SdkAssistantMessage,
  SdkPartialAssistantMessage,
  SdkResultMessage,
  SdkSystemMessage,
  SdkToolProgressMessage,
  SdkUserMessage,
  SessionStats,
} from '@/stores/claude/types';
import {
  ALL_MESSAGE_KINDS,
  emptyStats,
  emptyTabState,
  nextId,
  nextTabId,
} from '@/stores/claude/helpers';
import {
  finalizeExtractor,
  requestToTabMap,
} from '@/stores/claude/extractors';
import {
  derivedFromTab,
  derivedFromActiveTab,
  extractRequestId,
  extractSessionId,
  updateTabState,
} from '@/stores/claude/routing';
import {
  handleAssistantMessage,
  handleAutoDecision,
  handleError,
  handlePermissionRequest,
  handleResult,
  handleStreamEvent,
  handleSystemMessage,
  handleToolProgress,
} from '@/stores/claude/message-handlers';

// Re-export types for backward compatibility with existing consumers.
export type {
  ChatMessage,
  ClaudeTab,
  ClaudeTabState,
  MessageKind,
  SessionStats,
} from '@/stores/claude/types';

// ── Store interface ──

export interface ClaudeState {
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

export const useClaudeStore = create<ClaudeState>((set, get) => ({
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
    // Synchronously abort + clear mapping BEFORE the reducer runs, so any
    // server message that arrives for this requestId can no longer resolve
    // to a stale tab entry via requestToTabMap.
    const snapshot = get().tabStates[tabId];
    const reqId = snapshot?.currentRequestId ?? null;
    if (snapshot?.isStreaming && reqId) {
      abortRequest(reqId);
    }
    if (reqId) {
      requestToTabMap.delete(reqId);
    }
    // Clean up per-tab extractors synchronously — before the reducer drops
    // the tab state, so no finalize runs against a half-deleted entry.
    finalizeExtractor(tabId);

    set((s) => {
      const nextTabs = s.tabs.filter((t) => t.id !== tabId);
      const nextTabStates = { ...s.tabStates };
      delete nextTabStates[tabId];

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
    // Thin dispatcher — message-specific logic lives in
    // `src/stores/claude/message-handlers.ts`. See ADR-038.
    const sessionId = extractSessionId(msg);
    const reqId = extractRequestId(msg);

    switch (msg.type) {
      case 'message': {
        const data = (msg as { data: SdkAssistantMessage | SdkUserMessage | SdkSystemMessage | SdkPartialAssistantMessage | SdkToolProgressMessage }).data;
        if (data.type === 'stream_event') return handleStreamEvent(set, reqId, data as SdkPartialAssistantMessage);
        if (data.type === 'tool_progress') return handleToolProgress(set, reqId, data as SdkToolProgressMessage);
        if (data.type === 'system') return handleSystemMessage(set, reqId, data as SdkSystemMessage);
        if (data.type === 'assistant') return handleAssistantMessage(set, reqId, data as SdkAssistantMessage);
        // 'user' messages are no-ops on the client today.
        return;
      }
      case 'tool_call':
        return;
      case 'permission_request':
        return handlePermissionRequest(set, msg);
      case 'auto_decision':
        return handleAutoDecision(set, reqId, sessionId, msg);
      case 'result':
        return handleResult(set, reqId, (msg as { data: SdkResultMessage }).data);
      case 'error':
        return handleError(set, reqId, sessionId, msg);
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
