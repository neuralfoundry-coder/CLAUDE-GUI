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
    status: 'pending';
    hunks: DiffHunk[];
    acceptedHunkIds: string[];
  } | null;
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  openFile: (path: string) => Promise<void>;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  saveFile: (id: string) => Promise<void>;
  applyClaudeEdit: (path: string, modified: string) => void;
  acceptDiff: (id: string) => void;
  acceptAllHunks: (id: string) => void;
  rejectDiff: (id: string) => void;
  toggleHunk: (id: string, hunkId: string) => void;
  applyAcceptedHunks: (id: string) => void;
  syncExternalChange: (path: string) => Promise<void>;
  hasDirtyTabs: () => boolean;
  resetAll: () => void;
}

function pathToId(path: string): string {
  return path;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openFile: async (path) => {
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({ activeTabId: existing.id });
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
      }));
    } catch (err) {
      console.error('[editor] openFile failed', err);
    }
  },

  closeTab: (id) =>
    set((s) => {
      const next = s.tabs.filter((t) => t.id !== id);
      const activeTabId = s.activeTabId === id ? (next[next.length - 1]?.id ?? null) : s.activeTabId;
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
        const hunks = computeHunks(t.content, modified);
        return {
          ...t,
          locked: true,
          diff: {
            original: t.content,
            modified,
            status: 'pending',
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

  hasDirtyTabs: () => get().tabs.some((t) => t.dirty),

  resetAll: () => set({ tabs: [], activeTabId: null }),
}));
