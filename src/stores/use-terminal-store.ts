'use client';

import { create } from 'zustand';
import { terminalManager, type TerminalInstanceStatus } from '@/lib/terminal/terminal-manager';

export interface TerminalSession {
  id: string;
  name: string;
  createdAt: number;
  status: TerminalInstanceStatus;
  exitCode: number | null;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  createSession: () => string;
  closeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  updateSessionStatus: (id: string, status: TerminalInstanceStatus, exitCode: number | null) => void;
}

let counter = 0;

export const useTerminalStore = create<TerminalState>((set) => ({
  sessions: [],
  activeSessionId: null,

  createSession: () => {
    counter += 1;
    const id = `term-${Date.now()}-${counter}`;
    set((s) => ({
      sessions: [
        ...s.sessions,
        {
          id,
          name: `Terminal ${s.sessions.length + 1}`,
          createdAt: Date.now(),
          status: 'connecting',
          exitCode: null,
        },
      ],
      activeSessionId: id,
    }));
    void terminalManager.ensureSession(id);
    return id;
  },

  closeSession: (id) => {
    terminalManager.closeSession(id);
    set((s) => {
      const sessions = s.sessions.filter((t) => t.id !== id);
      const activeSessionId =
        s.activeSessionId === id ? (sessions[sessions.length - 1]?.id ?? null) : s.activeSessionId;
      return { sessions, activeSessionId };
    });
  },

  setActiveSession: (id) => {
    set({ activeSessionId: id });
    terminalManager.activate(id);
  },

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
}
