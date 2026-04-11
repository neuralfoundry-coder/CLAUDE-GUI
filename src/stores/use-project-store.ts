'use client';

import { create } from 'zustand';
import { projectApi } from '@/lib/api-client';

interface ProjectState {
  activeRoot: string | null;
  recents: string[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
  refresh: () => Promise<void>;
  openProject: (path: string) => Promise<void>;
  openParent: () => Promise<void>;
  applyRemoteChange: (root: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  activeRoot: null,
  recents: [],
  loading: false,
  error: null,
  initialized: false,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const data = await projectApi.get();
      set({
        activeRoot: data.root,
        recents: data.recents,
        loading: false,
        initialized: true,
      });
    } catch (err) {
      set({ loading: false, error: (err as Error).message, initialized: true });
    }
  },

  openProject: async (path) => {
    set({ loading: true, error: null });
    try {
      const data = await projectApi.set(path);
      set({
        activeRoot: data.root,
        recents: data.recents,
        loading: false,
        initialized: true,
      });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
      throw err;
    }
  },

  openParent: async () => {
    const current = get().activeRoot;
    if (!current) return;
    const parent = parentDirectory(current);
    if (!parent || parent === current) return;
    await get().openProject(parent);
  },

  applyRemoteChange: (root) =>
    set((s) => ({
      activeRoot: root,
      recents: [root, ...s.recents.filter((r) => r !== root)].slice(0, 10),
      initialized: true,
    })),
}));

function parentDirectory(absPath: string): string | null {
  const normalized = absPath.replace(/[/\\]+$/, '');
  const sepIdx = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (sepIdx < 0) return null;
  if (sepIdx === 0) return '/';
  if (/^[A-Za-z]:$/.test(normalized.slice(0, 2)) && sepIdx === 2) {
    return normalized.slice(0, 3);
  }
  return normalized.slice(0, sepIdx);
}
