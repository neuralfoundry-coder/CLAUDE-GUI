'use client';

import { create } from 'zustand';
import { projectApi } from '@/lib/api-client';

interface ProjectState {
  activeRoot: string | null;
  recents: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  openProject: (path: string) => Promise<void>;
  applyRemoteChange: (root: string) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  activeRoot: null,
  recents: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const data = await projectApi.get();
      set({ activeRoot: data.root, recents: data.recents, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  openProject: async (path) => {
    set({ loading: true, error: null });
    try {
      const data = await projectApi.set(path);
      set({ activeRoot: data.root, recents: data.recents, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
      throw err;
    }
  },

  applyRemoteChange: (root) =>
    set((s) => ({
      activeRoot: root,
      recents: [root, ...s.recents.filter((r) => r !== root)].slice(0, 10),
    })),
}));
