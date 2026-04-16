'use client';

import { create } from 'zustand';
import { filesApi } from '@/lib/api-client';

export interface IndexedFile {
  path: string;
  name: string;
}

interface FileIndexState {
  files: IndexedFile[];
  loading: boolean;
  initialized: boolean;
  buildIndex: () => Promise<void>;
  addFile: (path: string) => void;
  removeFile: (path: string) => void;
  reset: () => void;
}

async function listAllFiles(dir = '', depth = 0): Promise<IndexedFile[]> {
  if (depth > 3) return [];
  try {
    const { entries } = await filesApi.list(dir);
    const out: IndexedFile[] = [];
    for (const e of entries) {
      const full = dir ? `${dir}/${e.name}` : e.name;
      if (e.type === 'directory') {
        const sub = await listAllFiles(full, depth + 1);
        out.push(...sub);
      } else {
        out.push({ path: full, name: e.name });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export const useFileIndexStore = create<FileIndexState>((set, get) => ({
  files: [],
  loading: false,
  initialized: false,

  buildIndex: async () => {
    if (get().loading) return;
    set({ loading: true });
    const files = await listAllFiles();
    set({ files, loading: false, initialized: true });
  },

  addFile: (path) => {
    const name = path.split('/').pop() ?? path;
    set((s) => {
      if (s.files.some((f) => f.path === path)) return s;
      return { files: [...s.files, { path, name }] };
    });
  },

  removeFile: (path) => {
    set((s) => ({
      files: s.files.filter((f) => f.path !== path && !f.path.startsWith(path + '/')),
    }));
  },

  reset: () => set({ files: [], loading: false, initialized: false }),
}));
