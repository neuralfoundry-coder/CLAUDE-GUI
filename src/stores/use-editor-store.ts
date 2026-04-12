'use client';

import { create } from 'zustand';
import { filesApi } from '@/lib/api-client';
import { computeHunks, applyHunks, type DiffHunk } from '@/lib/diff/line-diff';

export interface EditorTab {
  id: string;
  path: string;
  content: string;
  originalContent: string;
  dirty: boolean;
  locked: boolean;
  diff?: {
    original: string;
    modified: string;
    status: 'pending' | 'streaming';
    hunks: DiffHunk[];
    acceptedHunkIds: string[];
  } | null;
}

export interface PendingReveal {
  path: string;
  line?: number;
  col?: number;
  /** Monotonic counter so repeated reveals of the same line still fire. */
  tick: number;
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  pendingReveal: PendingReveal | null;
  cursorLine: number | null;
  cursorCol: number | null;
  completionLoading: boolean;
  openFile: (path: string, opts?: { line?: number; col?: number }) => Promise<void>;
  clearPendingReveal: () => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;
  closeTabsToTheRight: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  saveFile: (id: string) => Promise<void>;
  applyClaudeEdit: (path: string, modified: string) => void;
  updateStreamingEdit: (path: string, partialModified: string) => void;
  acceptDiff: (id: string) => void;
  acceptAllHunks: (id: string) => void;
  rejectDiff: (id: string) => void;
  toggleHunk: (id: string, hunkId: string) => void;
  applyAcceptedHunks: (id: string) => void;
  syncExternalChange: (path: string) => Promise<void>;
  setCursorPosition: (line: number, col: number) => void;
  setCompletionLoading: (loading: boolean) => void;
  hasDirtyTabs: () => boolean;
  resetAll: () => void;
}

function pathToId(path: string): string {
  return path;
}

let revealTick = 0;

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  pendingReveal: null,
  cursorLine: null,
  cursorCol: null,
  completionLoading: false,

  openFile: async (path, opts) => {
    const reveal = opts?.line
      ? { path, line: opts.line, col: opts.col, tick: ++revealTick }
      : null;
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({ activeTabId: existing.id, pendingReveal: reveal });
      return;
    }
    try {
      const { content } = await filesApi.read(path);
      const tab: EditorTab = {
        id: pathToId(path),
        path,
        content,
        originalContent: content,
        dirty: false,
        locked: false,
        diff: null,
      };
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        pendingReveal: reveal,
      }));
    } catch (err) {
      console.error('[editor] openFile failed', err);
    }
  },

  clearPendingReveal: () => set({ pendingReveal: null }),

  closeTab: (id) =>
    set((s) => {
      const next = s.tabs.filter((t) => t.id !== id);
      const activeTabId = s.activeTabId === id ? (next[next.length - 1]?.id ?? null) : s.activeTabId;
      return { tabs: next, activeTabId };
    }),

  closeOtherTabs: (id) =>
    set((s) => ({
      tabs: s.tabs.filter((t) => t.id === id),
      activeTabId: id,
    })),

  closeAllTabs: () =>
    set({ tabs: [], activeTabId: null }),

  closeTabsToTheRight: (id) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return s;
      const next = s.tabs.slice(0, idx + 1);
      const activeTabId = next.find((t) => t.id === s.activeTabId)
        ? s.activeTabId
        : next[next.length - 1]?.id ?? null;
      return { tabs: next, activeTabId };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateContent: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, content, dirty: content !== t.originalContent } : t,
      ),
    })),

  saveFile: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    await filesApi.write(tab.path, tab.content);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, originalContent: t.content, dirty: false } : t,
      ),
    }));
  },

  applyClaudeEdit: (path, modified) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.path !== path) return t;
        // Use the streaming diff's original as baseline if one exists
        const original = t.diff?.original ?? t.content;
        const hunks = computeHunks(original, modified);
        return {
          ...t,
          locked: true,
          diff: {
            original,
            modified,
            status: 'pending' as const,
            hunks,
            acceptedHunkIds: hunks.map((h) => h.id),
          },
        };
      }),
    })),

  updateStreamingEdit: (path, partialModified) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.path !== path) return t;
        const original = t.diff?.original ?? t.content;
        const hunks = computeHunks(original, partialModified);
        return {
          ...t,
          locked: true,
          diff: {
            original,
            modified: partialModified,
            status: 'streaming' as const,
            hunks,
            acceptedHunkIds: hunks.map((h) => h.id),
          },
        };
      }),
    })),

  acceptDiff: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== id || !t.diff) return t;
        return {
          ...t,
          content: t.diff.modified,
          originalContent: t.diff.modified,
          dirty: false,
          locked: false,
          diff: null,
        };
      }),
    })),

  acceptAllHunks: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== id || !t.diff) return t;
        return {
          ...t,
          diff: { ...t.diff, acceptedHunkIds: t.diff.hunks.map((h) => h.id) },
        };
      }),
    })),

  toggleHunk: (id, hunkId) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== id || !t.diff) return t;
        const accepted = new Set(t.diff.acceptedHunkIds);
        if (accepted.has(hunkId)) accepted.delete(hunkId);
        else accepted.add(hunkId);
        return { ...t, diff: { ...t.diff, acceptedHunkIds: Array.from(accepted) } };
      }),
    })),

  applyAcceptedHunks: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== id || !t.diff) return t;
        const finalContent = applyHunks(
          t.diff.original,
          t.diff.hunks,
          new Set(t.diff.acceptedHunkIds),
        );
        return {
          ...t,
          content: finalContent,
          originalContent: finalContent,
          dirty: false,
          locked: false,
          diff: null,
        };
      }),
    })),

  rejectDiff: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, locked: false, diff: null, content: t.diff?.original ?? t.content } : t,
      ),
    })),

  syncExternalChange: async (path) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) return;
    // Skip if Claude diff is showing — tool_use already set the diff view
    if (tab.diff) return;
    try {
      const { content } = await filesApi.read(path);
      if (content === tab.content) return;
      if (tab.dirty) {
        console.warn(`[editor] external change conflict on ${path}`);
        return;
      }
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === path ? { ...t, content, originalContent: content } : t,
        ),
      }));
    } catch (err) {
      console.error('[editor] syncExternalChange failed', err);
    }
  },

  setCursorPosition: (line, col) => set({ cursorLine: line, cursorCol: col }),

  setCompletionLoading: (completionLoading) => set({ completionLoading }),

  hasDirtyTabs: () => get().tabs.some((t) => t.dirty),

  resetAll: () => set({ tabs: [], activeTabId: null, cursorLine: null, cursorCol: null }),
}));
