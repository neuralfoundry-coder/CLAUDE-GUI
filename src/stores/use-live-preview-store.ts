'use client';

import { create } from 'zustand';

export type LivePreviewMode = 'idle' | 'live-html' | 'live-code';

interface LivePreviewState {
  streamId: string | null;
  buffer: string;
  mode: LivePreviewMode;
  lastFlushAt: number;
  autoSwitch: boolean;
  startStream: (id: string) => void;
  appendChunk: (html: string, renderable: boolean) => void;
  finalize: () => void;
  reset: () => void;
  setAutoSwitch: (enabled: boolean) => void;
}

export const useLivePreviewStore = create<LivePreviewState>((set) => ({
  streamId: null,
  buffer: '',
  mode: 'idle',
  lastFlushAt: 0,
  autoSwitch: true,

  startStream: (streamId) =>
    set({ streamId, buffer: '', mode: 'live-code', lastFlushAt: Date.now() }),

  appendChunk: (html, renderable) =>
    set({
      buffer: html,
      mode: renderable ? 'live-html' : 'live-code',
      lastFlushAt: Date.now(),
    }),

  finalize: () =>
    set((s) => ({
      mode: s.buffer && s.mode !== 'idle' ? s.mode : 'idle',
      lastFlushAt: Date.now(),
    })),

  reset: () => set({ streamId: null, buffer: '', mode: 'idle', lastFlushAt: 0 }),

  setAutoSwitch: (autoSwitch) => set({ autoSwitch }),
}));
