'use client';

import { create } from 'zustand';

export interface SearchMatch {
  file: string;
  line: number;
  text: string;
}

/** One file's replacement summary returned by POST /api/files/replace. */
export interface ReplaceFileResult {
  path: string;
  replacements: number;
  status: 'ok' | 'skipped' | 'error';
  error?: string;
  preview?: { before: string; after: string } | null;
}

export interface ReplaceSummary {
  dryRun: boolean;
  totalReplacements: number;
  filesChanged: number;
  filesScanned: number;
  results: ReplaceFileResult[];
}

interface SearchState {
  open: boolean;
  query: string;
  results: SearchMatch[];
  loading: boolean;
  truncated: boolean;
  caseSensitive: boolean;
  glob: string;

  replaceMode: boolean;
  replacement: string;
  replaceLoading: boolean;
  replacePreview: ReplaceSummary | null;
  replaceError: string | null;

  setOpen: (open: boolean) => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  setCaseSensitive: (v: boolean) => void;
  setGlob: (glob: string) => void;
  search: () => Promise<void>;
  clear: () => void;

  setReplaceMode: (on: boolean) => void;
  setReplacement: (s: string) => void;
  previewReplace: () => Promise<void>;
  applyReplace: () => Promise<void>;
  clearReplacePreview: () => void;
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

  replaceMode: false,
  replacement: '',
  replaceLoading: false,
  replacePreview: null,
  replaceError: null,

  setReplaceMode: (on) => set({ replaceMode: on, replacePreview: null, replaceError: null }),
  setReplacement: (s) => set({ replacement: s, replacePreview: null, replaceError: null }),

  previewReplace: async () => {
    const { query, replacement, caseSensitive, results } = get();
    if (!query.trim() || results.length === 0) return;
    // Unique files from the search results — Replace operates on what Search already found.
    const files = Array.from(new Set(results.map((r) => r.file)));
    set({ replaceLoading: true, replaceError: null });
    try {
      const { getBrowserId } = await import('@/lib/browser-session');
      const res = await fetch('/api/files/replace', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-browser-id': getBrowserId() },
        body: JSON.stringify({ query, replace: replacement, caseSensitive, dryRun: true, files }),
      });
      const json = await res.json();
      if (json.success) {
        set({ replacePreview: json.data, replaceLoading: false });
      } else {
        set({ replaceLoading: false, replaceError: json.error ?? 'Preview failed' });
      }
    } catch (err) {
      set({ replaceLoading: false, replaceError: (err as Error).message });
    }
  },

  applyReplace: async () => {
    const { query, replacement, caseSensitive, replacePreview } = get();
    if (!replacePreview) return;
    // Apply only to files that had replacements in the dry-run.
    const files = replacePreview.results
      .filter((r) => r.status === 'ok' && r.replacements > 0)
      .map((r) => r.path);
    if (files.length === 0) return;
    set({ replaceLoading: true, replaceError: null });
    try {
      const { getBrowserId } = await import('@/lib/browser-session');
      const res = await fetch('/api/files/replace', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-browser-id': getBrowserId() },
        body: JSON.stringify({ query, replace: replacement, caseSensitive, dryRun: false, files }),
      });
      const json = await res.json();
      if (json.success) {
        set({ replacePreview: json.data, replaceLoading: false });
        // Re-run search so the results reflect the post-replace file contents.
        await get().search();
      } else {
        set({ replaceLoading: false, replaceError: json.error ?? 'Apply failed' });
      }
    } catch (err) {
      set({ replaceLoading: false, replaceError: (err as Error).message });
    }
  },

  clearReplacePreview: () => set({ replacePreview: null, replaceError: null }),
}));
