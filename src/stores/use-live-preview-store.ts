'use client';

import { create } from 'zustand';
import type { StreamPageKind } from '@/lib/claude/universal-stream-extractor';

export type LivePreviewMode = 'idle' | 'streaming' | 'complete';

export interface LivePage {
  id: string;
  kind: StreamPageKind;
  language: string;
  title: string;
  content: string;
  filePath?: string;
  renderable: boolean;
  complete: boolean;
  viewMode: 'source' | 'rendered';
}

interface LivePreviewState {
  streamId: string | null;
  pages: LivePage[];
  activePageIndex: number;
  mode: LivePreviewMode;
  lastFlushAt: number;
  autoSwitch: boolean;

  // ---- Backward-compat shims (used by preview-download, etc.) ----
  /** Returns the content of the active page (replaces old `buffer`). */
  readonly buffer: string;
  /** Returns the filePath of the active page (replaces old `generatedFilePath`). */
  readonly generatedFilePath: string | null;

  startStream: (id: string) => void;
  addPage: (page: Omit<LivePage, 'viewMode'>) => void;
  updatePageContent: (pageId: string, content: string, renderable: boolean) => void;
  completePage: (pageId: string, content: string) => void;
  setActivePageIndex: (index: number) => void;
  togglePageViewMode: (pageId: string) => void;
  finalize: () => void;
  reset: () => void;
  setAutoSwitch: (enabled: boolean) => void;
  setGeneratedFilePath: (path: string | null) => void;
}

function activePage(pages: LivePage[], index: number): LivePage | undefined {
  return pages[index];
}

export const useLivePreviewStore = create<LivePreviewState>((set, get) => ({
  streamId: null,
  pages: [],
  activePageIndex: 0,
  mode: 'idle',
  lastFlushAt: 0,
  autoSwitch: true,

  // Backward-compat getters
  get buffer() {
    const s = get();
    return activePage(s.pages, s.activePageIndex)?.content ?? '';
  },
  get generatedFilePath() {
    const s = get();
    return activePage(s.pages, s.activePageIndex)?.filePath ?? null;
  },

  startStream: (streamId) =>
    set((s) => ({
      streamId,
      // Keep existing pages so follow-up streams (Edit on prev content) work
      pages: s.pages,
      activePageIndex: s.activePageIndex,
      mode: s.pages.length > 0 ? s.mode : 'idle',
      lastFlushAt: Date.now(),
    })),

  addPage: (page) =>
    set((s) => {
      const newPage: LivePage = {
        ...page,
        viewMode: page.renderable ? 'rendered' : 'source',
      };
      const nextPages = [...s.pages, newPage];
      return {
        pages: nextPages,
        activePageIndex: s.autoSwitch ? nextPages.length - 1 : s.activePageIndex,
        mode: 'streaming',
        lastFlushAt: Date.now(),
      };
    }),

  updatePageContent: (pageId, content, renderable) =>
    set((s) => {
      const pages = s.pages.map((p) =>
        p.id === pageId
          ? {
              ...p,
              content,
              renderable,
              // Auto-switch from source to rendered when content becomes renderable
              viewMode: (!p.renderable && renderable ? 'rendered' : p.viewMode) as
                | 'source'
                | 'rendered',
            }
          : p,
      );
      return { pages, mode: 'streaming', lastFlushAt: Date.now() };
    }),

  completePage: (pageId, content) =>
    set((s) => {
      const pages = s.pages.map((p) =>
        p.id === pageId
          ? {
              ...p,
              content,
              complete: true,
              renderable: p.renderable || content.length > 0,
            }
          : p,
      );
      return { pages, lastFlushAt: Date.now() };
    }),

  setActivePageIndex: (index) => set({ activePageIndex: index }),

  togglePageViewMode: (pageId) =>
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === pageId
          ? { ...p, viewMode: p.viewMode === 'source' ? 'rendered' : 'source' }
          : p,
      ),
    })),

  finalize: () =>
    set((s) => ({
      mode: s.pages.length > 0 ? 'complete' : 'idle',
      lastFlushAt: Date.now(),
    })),

  reset: () =>
    set({
      streamId: null,
      pages: [],
      activePageIndex: 0,
      mode: 'idle',
      lastFlushAt: 0,
    }),

  setAutoSwitch: (autoSwitch) => set({ autoSwitch }),

  setGeneratedFilePath: (path) =>
    set((s) => {
      if (!path) return s;
      const active = activePage(s.pages, s.activePageIndex);
      if (!active) return s;
      return {
        pages: s.pages.map((p) => (p.id === active.id ? { ...p, filePath: path } : p)),
      };
    }),
}));
