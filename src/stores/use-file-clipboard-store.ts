'use client';

import { create } from 'zustand';

export type FileClipboardMode = 'copy' | 'cut';

interface FileClipboardState {
  paths: string[];
  mode: FileClipboardMode | null;

  setClipboard: (mode: FileClipboardMode, paths: string[]) => void;
  clear: () => void;
  isCut: (path: string) => boolean;
}

export const useFileClipboardStore = create<FileClipboardState>((set, get) => ({
  paths: [],
  mode: null,

  setClipboard: (mode, paths) => set({ mode, paths: [...paths] }),
  clear: () => set({ mode: null, paths: [] }),
  isCut: (path) => {
    const s = get();
    return s.mode === 'cut' && s.paths.includes(path);
  },
}));
