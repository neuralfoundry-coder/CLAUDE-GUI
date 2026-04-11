'use client';

import { create } from 'zustand';

export type PreviewType = 'html' | 'pdf' | 'markdown' | 'image' | 'slides' | 'none';

interface PreviewState {
  currentFile: string | null;
  pageNumber: number;
  zoom: number;
  setFile: (path: string | null) => void;
  setPage: (page: number) => void;
  setZoom: (zoom: number) => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  currentFile: null,
  pageNumber: 1,
  zoom: 1,
  setFile: (currentFile) => set({ currentFile, pageNumber: 1 }),
  setPage: (pageNumber) => set({ pageNumber }),
  setZoom: (zoom) => set({ zoom }),
}));

export function detectPreviewType(path: string | null): PreviewType {
  if (!path) return 'none';
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'html' || ext === 'htm') return path.includes('slides') || path.endsWith('.reveal.html') ? 'slides' : 'html';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'image';
  return 'none';
}
