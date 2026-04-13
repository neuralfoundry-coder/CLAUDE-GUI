'use client';

import { create } from 'zustand';
import { terminalManager, type TerminalInstanceStatus } from '@/lib/terminal/terminal-manager';

export interface NativeTerminalNotice {
  type: 'success' | 'error';
  message: string;
  ts: number;
}

export interface TerminalSession {
  id: string;
  name: string;
  createdAt: number;
  status: TerminalInstanceStatus;
  exitCode: number | null;
  cwd: string | null;
  customName: boolean;
  unread: boolean;
}

interface TerminalState {
  sessions: TerminalSession[];
  /**
   * Session ID targeted by keyboard shortcuts and the single tab bar.
   * Always equals `paneSessionIds[activePaneIndex]` for whichever pane has
   * keyboard focus, or null if no sessions exist.
   */
  activeSessionId: string | null;
  /** Pane 0 (primary) session, always shown. */
  primarySessionId: string | null;
  /** Pane 1 (secondary) session, only shown when `splitEnabled`. */
  secondarySessionId: string | null;
  splitEnabled: boolean;
  activePaneIndex: 0 | 1;
  searchOverlayOpen: boolean;
  nativeTerminalNotice: NativeTerminalNotice | null;
  setNativeTerminalNotice: (notice: NativeTerminalNotice | null) => void;
  createSession: (opts?: { initialCwd?: string; name?: string }) => string;
  closeSession: (id: string) => void;
  closeActiveSession: () => void;
  restartSession: (id: string) => void;
  restartActiveSession: () => void;
  setActiveSession: (id: string) => void;
  toggleSplit: () => void;
  focusPane: (index: 0 | 1) => void;
  markUnread: (id: string) => void;
  activateTabByIndex: (index: number) => void;
  nextTab: () => void;
  prevTab: () => void;
  openSearchOverlay: () => void;
  closeSearchOverlay: () => void;
  toggleSearchOverlay: () => void;
  clearActiveBuffer: () => void;
  renameSession: (id: string, name: string) => void;
  moveSession: (id: string, direction: -1 | 1) => void;
  reorderSession: (fromIndex: number, toIndex: number) => void;
  updateSessionCwd: (id: string, cwd: string | null) => void;
  updateSessionStatus: (id: string, status: TerminalInstanceStatus, exitCode: number | null) => void;
}

let counter = 0;

/**
 * Assign a session to whichever pane currently owns keyboard focus, update
 * the derived `activeSessionId`, and return the new slice. Used by
 * `createSession` and `setActiveSession`.
 */
function assignToActivePane<T extends Pick<
  TerminalState,
  'primarySessionId' | 'secondarySessionId' | 'splitEnabled' | 'activePaneIndex' | 'activeSessionId'
>>(state: T, id: string | null): Partial<TerminalState> {
  const toSecondary = state.splitEnabled && state.activePaneIndex === 1;
  if (toSecondary) {
    return { secondarySessionId: id, activeSessionId: id };
  }
  return { primarySessionId: id, activeSessionId: id };
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  primarySessionId: null,
  secondarySessionId: null,
  splitEnabled: false,
  activePaneIndex: 0,
  searchOverlayOpen: false,
  nativeTerminalNotice: null,
  setNativeTerminalNotice: (notice) => set({ nativeTerminalNotice: notice }),

  createSession: (opts) => {
    counter += 1;
    const id = `term-${Date.now()}-${counter}`;
    const initialCwd = opts?.initialCwd ?? null;
    set((s) => {
      const sessions = [
        ...s.sessions,
        {
          id,
          name: opts?.name ?? `Terminal ${s.sessions.length + 1}`,
          createdAt: Date.now(),
          status: 'connecting' as TerminalInstanceStatus,
          exitCode: null,
          cwd: initialCwd,
          customName: Boolean(opts?.name),
          unread: false,
        },
      ];
      return {
        sessions,
        searchOverlayOpen: false,
        ...assignToActivePane(s, id),
      };
    });
    // Do NOT call ensureSession here — XTerminalAttach handles it on mount.
    // This avoids a race where both the store and the component create a
    // WebSocket for the same session. initialCwd is stored in the session
    // record and read by XTerminalAttach.
    return id;
  },

  closeSession: (id) => {
    terminalManager.closeSession(id);
    set((s) => {
      const sessions = s.sessions.filter((t) => t.id !== id);
      const fallback = sessions[sessions.length - 1]?.id ?? null;
      const primarySessionId = s.primarySessionId === id ? fallback : s.primarySessionId;
      let secondarySessionId = s.secondarySessionId === id ? fallback : s.secondarySessionId;
      // Avoid pointing both panes at the same fallback — prefer a different
      // session if available.
      if (
        primarySessionId &&
        secondarySessionId &&
        primarySessionId === secondarySessionId
      ) {
        const alt = sessions.find((x) => x.id !== primarySessionId)?.id ?? null;
        if (alt) secondarySessionId = alt;
      }
      // If secondary has nothing and split is on, collapse split.
      let splitEnabled = s.splitEnabled;
      let activePaneIndex = s.activePaneIndex;
      if (splitEnabled && secondarySessionId == null) {
        splitEnabled = false;
        activePaneIndex = 0;
      }
      const activeSessionId = activePaneIndex === 1 ? secondarySessionId : primarySessionId;
      return {
        sessions,
        primarySessionId,
        secondarySessionId,
        splitEnabled,
        activePaneIndex,
        activeSessionId,
      };
    });
  },

  closeActiveSession: () => {
    const id = get().activeSessionId;
    if (id) get().closeSession(id);
  },

  restartSession: (id) => {
    terminalManager.restartSession(id);
  },

  restartActiveSession: () => {
    const id = get().activeSessionId;
    if (id) terminalManager.restartSession(id);
  },

  setActiveSession: (id) => {
    set((s) => ({
      searchOverlayOpen: false,
      sessions: s.sessions.map((sess) => (sess.id === id ? { ...sess, unread: false } : sess)),
      ...assignToActivePane(s, id),
    }));
    terminalManager.activate(id);
  },

  toggleSplit: () => {
    const s = get();
    if (s.splitEnabled) {
      // Collapse split. Keep pane 0's session as the active one; the session
      // that was in pane 1 lives on as a background tab (not auto-closed).
      set({
        splitEnabled: false,
        activePaneIndex: 0,
        secondarySessionId: null,
        activeSessionId: s.primarySessionId,
      });
      if (s.primarySessionId) terminalManager.activate(s.primarySessionId);
      return;
    }
    // Enabling split. If there's already another session we can borrow, use
    // it for pane 1; otherwise create a fresh session for pane 1.
    const alt = s.sessions.find((sess) => sess.id !== s.primarySessionId);
    if (alt) {
      set({
        splitEnabled: true,
        secondarySessionId: alt.id,
        activePaneIndex: 1,
        activeSessionId: alt.id,
      });
      terminalManager.activate(alt.id);
      return;
    }
    // No alternative — spawn one. We temporarily flip splitEnabled+pane so
    // createSession assigns the new session to pane 1.
    set({ splitEnabled: true, activePaneIndex: 1 });
    get().createSession();
  },

  focusPane: (index) => {
    const s = get();
    if (!s.splitEnabled && index === 1) return;
    if (s.activePaneIndex === index) return;
    const newActiveId = index === 1 ? s.secondarySessionId : s.primarySessionId;
    set({ activePaneIndex: index, activeSessionId: newActiveId });
    if (newActiveId) terminalManager.activate(newActiveId);
  },

  markUnread: (id) =>
    set((s) => {
      if (s.activeSessionId === id) return s;
      const sess = s.sessions.find((x) => x.id === id);
      if (!sess || sess.unread) return s;
      return {
        sessions: s.sessions.map((x) => (x.id === id ? { ...x, unread: true } : x)),
      };
    }),

  activateTabByIndex: (index) => {
    const { sessions } = get();
    const target = sessions[index];
    if (!target) return;
    get().setActiveSession(target.id);
  },

  nextTab: () => {
    const { sessions, activeSessionId } = get();
    if (sessions.length === 0) return;
    const i = sessions.findIndex((s) => s.id === activeSessionId);
    const next = sessions[(i + 1) % sessions.length]!;
    get().setActiveSession(next.id);
  },

  prevTab: () => {
    const { sessions, activeSessionId } = get();
    if (sessions.length === 0) return;
    const i = sessions.findIndex((s) => s.id === activeSessionId);
    const prev = sessions[(i - 1 + sessions.length) % sessions.length]!;
    get().setActiveSession(prev.id);
  },

  openSearchOverlay: () => {
    if (!get().activeSessionId) return;
    set({ searchOverlayOpen: true });
  },

  closeSearchOverlay: () => {
    set({ searchOverlayOpen: false });
  },

  toggleSearchOverlay: () => {
    if (!get().activeSessionId) return;
    set((s) => ({ searchOverlayOpen: !s.searchOverlayOpen }));
  },

  clearActiveBuffer: () => {
    const id = get().activeSessionId;
    if (id) terminalManager.clearBuffer(id);
  },

  renameSession: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, name: trimmed, customName: true } : sess,
      ),
    }));
  },

  moveSession: (id, direction) => {
    set((s) => {
      const idx = s.sessions.findIndex((sess) => sess.id === id);
      if (idx < 0) return s;
      const target = idx + direction;
      if (target < 0 || target >= s.sessions.length) return s;
      const sessions = [...s.sessions];
      const [moved] = sessions.splice(idx, 1);
      sessions.splice(target, 0, moved!);
      return { sessions };
    });
  },

  reorderSession: (fromIndex, toIndex) => {
    set((s) => {
      if (fromIndex === toIndex) return s;
      if (fromIndex < 0 || fromIndex >= s.sessions.length) return s;
      if (toIndex < 0 || toIndex >= s.sessions.length) return s;
      const sessions = [...s.sessions];
      const [moved] = sessions.splice(fromIndex, 1);
      sessions.splice(toIndex, 0, moved!);
      return { sessions };
    });
  },

  updateSessionCwd: (id, cwd) =>
    set((s) => ({
      sessions: s.sessions.map((sess) => (sess.id === id ? { ...sess, cwd } : sess)),
    })),

  updateSessionStatus: (id, status, exitCode) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, status, exitCode } : sess,
      ),
    })),
}));

if (typeof window !== 'undefined') {
  terminalManager.onSessionChange((id, status, exitCode) => {
    useTerminalStore.getState().updateSessionStatus(id, status, exitCode);
  });
  terminalManager.onCwdChange((id, cwd) => {
    useTerminalStore.getState().updateSessionCwd(id, cwd);
  });
  terminalManager.onActivity((id) => {
    useTerminalStore.getState().markUnread(id);
  });
}
