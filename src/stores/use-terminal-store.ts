'use client';

import { create } from 'zustand';

export interface TerminalSession {
  id: string;
  name: string;
  createdAt: number;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  createSession: () => string;
  closeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
}

let counter = 0;

export const useTerminalStore = create<TerminalState>((set) => ({
  sessions: [],
  activeSessionId: null,

  createSession: () => {
    counter += 1;
    const id = `term-${Date.now()}-${counter}`;
    set((s) => ({
      sessions: [...s.sessions, { id, name: `Terminal ${s.sessions.length + 1}`, createdAt: Date.now() }],
      activeSessionId: id,
    }));
    return id;
  },

  closeSession: (id) =>
    set((s) => {
      const sessions = s.sessions.filter((t) => t.id !== id);
      const activeSessionId = s.activeSessionId === id ? (sessions[sessions.length - 1]?.id ?? null) : s.activeSessionId;
      return { sessions, activeSessionId };
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),
}));
