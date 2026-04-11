'use client';

import { create } from 'zustand';

export type LivePreviewMode = 'idle' | 'live-html' | 'live-code';

interface LivePreviewState {
  streamId: string | null;
  buffer: string;
  mode: LivePreviewMode;
  lastFlushAt: number;
  autoSwitch: boolean;
  generatedFilePath: string | null;
  startStream: (id: string) => void;
  appendChunk: (html: string, renderable: boolean) => void;
  finalize: () => void;
  reset: () => void;
  setAutoSwitch: (enabled: boolean) => void;
  setGeneratedFilePath: (path: string | null) => void;
}

export const useLivePreviewStore = create<LivePreviewState>((set) => ({
  streamId: null,
  buffer: '',
  mode: 'idle',
  lastFlushAt: 0,
  autoSwitch: true,
  generatedFilePath: null,

  startStream: (streamId) =>
    set((s) => ({
      streamId,
      // Preserve the previous buffer so a follow-up stream that only edits
      // part of the document (e.g. Edit/MultiEdit on page 3 of a 5-page
      // HTML) still has the prior render as its baseline. Incoming chunks
      // replace the buffer as soon as they arrive.
      buffer: s.buffer,
      mode: s.buffer ? s.mode : 'live-code',
      lastFlushAt: Date.now(),
      generatedFilePath: s.generatedFilePath,
    })),

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

  reset: () =>
    set({
      streamId: null,
      buffer: '',
      mode: 'idle',
      lastFlushAt: 0,
      generatedFilePath: null,
    }),

  setAutoSwitch: (autoSwitch) => set({ autoSwitch }),

  setGeneratedFilePath: (generatedFilePath) => set({ generatedFilePath }),
}));
