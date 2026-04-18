import type { ClaudeServerMessage } from '@/types/websocket';
import type { ClaudeState } from '@/stores/use-claude-store';
import { emptyTabState } from './helpers';
import { requestToTabMap } from './extractors';
import type { ClaudeTabState } from './types';

export function extractSessionId(msg: ClaudeServerMessage): string | undefined {
  // Try common patterns from server messages.
  const data = (msg as { data?: { session_id?: string } }).data;
  if (data?.session_id) return data.session_id;
  const msgAny = msg as { session_id?: string };
  return msgAny.session_id;
}

export function extractRequestId(msg: ClaudeServerMessage): string | undefined {
  return (msg as { requestId?: string }).requestId;
}

/**
 * Resolve which tab should receive a message. Priority:
 *   1. Tab that owns the session_id (already assigned).
 *   2. Tab that initiated the requestId (before session_id assignment).
 *   3. Active tab (last resort).
 */
export function resolveTabId(
  s: ClaudeState,
  sessionId: string | undefined | null,
  requestId?: string | undefined,
): string | null {
  if (sessionId) {
    const tab = s.tabs.find((t) => t.sessionId === sessionId);
    if (tab) return tab.id;
  }
  if (requestId) {
    const tabId = requestToTabMap.get(requestId);
    if (tabId && s.tabStates[tabId]) return tabId;
  }
  return s.activeTabId;
}

/**
 * If a tab doesn't have a sessionId yet, assign it from the server response.
 * Returns a partial state patch that the caller merges into their `set` return.
 */
export function assignSessionToTab(
  s: ClaudeState,
  tabId: string,
  sessionId: string | undefined | null,
): Partial<ClaudeState> {
  if (!sessionId) return {};
  const tab = s.tabs.find((t) => t.id === tabId);
  if (!tab || tab.sessionId === sessionId) return {};
  if (tab.sessionId && tab.sessionId !== sessionId) return {};
  return {
    tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, sessionId } : t)),
    ...(tabId === s.activeTabId ? { activeSessionId: sessionId } : {}),
  };
}

/**
 * Patch a specific tab's state and, if it's the active tab, mirror the
 * backward-compat top-level fields.
 */
export function updateTabState(
  s: ClaudeState,
  tabId: string,
  updater: (ts: ClaudeTabState) => Partial<ClaudeTabState>,
): Partial<ClaudeState> {
  const ts = s.tabStates[tabId] ?? emptyTabState();
  const patch = updater(ts);
  const nextTs = { ...ts, ...patch };
  return {
    tabStates: { ...s.tabStates, [tabId]: nextTs },
    ...(tabId === s.activeTabId ? derivedFromTab(nextTs) : {}),
  };
}

/**
 * Derive backward-compat top-level fields from a tab's state. Does NOT set
 * `activeSessionId` — use `assignSessionToTab` or set it explicitly.
 */
export function derivedFromTab(ts: ClaudeTabState): Partial<ClaudeState> {
  return {
    messages: ts.messages,
    isStreaming: ts.isStreaming,
    pendingPermission: ts.pendingPermission,
    currentRequestId: ts.currentRequestId,
    messageFilter: ts.messageFilter,
  };
}

/** Derive all backward-compat fields when switching active tab (includes activeSessionId). */
export function derivedFromActiveTab(s: ClaudeState, tabId: string): Partial<ClaudeState> {
  const ts = s.tabStates[tabId] ?? emptyTabState();
  const tab = s.tabs.find((t) => t.id === tabId);
  return {
    ...derivedFromTab(ts),
    activeSessionId: tab?.sessionId ?? null,
  };
}
