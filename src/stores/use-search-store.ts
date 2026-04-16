'use client';

import { create } from 'zustand';

export interface SearchMatch {
  file: string;
  line: number;
  text: string;
}

interface SearchState {
  open: boolean;
  query: string;
  results: SearchMatch[];
  loading: boolean;
  truncated: boolean;
  caseSensitive: boolean;
  glob: string;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  setCaseSensitive: (v: boolean) => void;
  setGlob: (glob: string) => void;
  search: () => Promise<void>;
  clear: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  open: false,
  query: '',
  results: [],
  loading: false,
  truncated: false,
  caseSensitive: true,
  glob: '',

  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  setQuery: (query) => set({ query }),
  setCaseSensitive: (caseSensitive) => set({ caseSensitive }),
  setGlob: (glob) => set({ glob }),

  search: async () => {
    const { query, caseSensitive, glob } = get();
    if (!query.trim()) return;
    set({ loading: true });
    try {
      const params = new URLSearchParams({ q: query });
      if (!caseSensitive) params.set('case', 'false');
      if (glob) params.set('glob', glob);

      const { getBrowserId } = await import('@/lib/browser-session');
      const res = await fetch(`/api/files/search?${params.toString()}`, {
        headers: { 'x-browser-id': getBrowserId() },
      });
      const json = await res.json();
      if (json.success) {
        set({ results: json.data.matches, truncated: json.data.truncated, loading: false });
      } else {
        set({ results: [], loading: false });
      }
    } catch {
      set({ results: [], loading: false });
    }
  },

  clear: () => set({ results: [], query: '', truncated: false }),
}));
