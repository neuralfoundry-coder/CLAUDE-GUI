'use client';

import { create } from 'zustand';

export type PreviewType =
  | 'html'
  | 'pdf'
  | 'markdown'
  | 'image'
  | 'slides'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'none';

export type PreviewViewMode = 'rendered' | 'source';

interface PreviewState {
  currentFile: string | null;
  pageNumber: number;
  zoom: number;
  fullscreen: boolean;
  viewMode: PreviewViewMode;
  setFile: (path: string | null) => void;
  setPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  toggleFullscreen: () => void;
  setFullscreen: (value: boolean) => void;
  setViewMode: (mode: PreviewViewMode) => void;
  toggleViewMode: () => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  currentFile: null,
  pageNumber: 1,
  zoom: 1,
  fullscreen: false,
  viewMode: 'rendered',
  setFile: (currentFile) => set({ currentFile, pageNumber: 1, viewMode: 'rendered' }),
  setPage: (pageNumber) => set({ pageNumber }),
  setZoom: (zoom) => set({ zoom }),
  toggleFullscreen: () => set((s) => ({ fullscreen: !s.fullscreen })),
  setFullscreen: (fullscreen) => set({ fullscreen }),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleViewMode: () => set((s) => ({ viewMode: s.viewMode === 'source' ? 'rendered' : 'source' })),
}));

export function isSourceToggleable(type: PreviewType): boolean {
  return type === 'html' || type === 'markdown' || type === 'slides';
}

export function detectPreviewType(path: string | null): PreviewType {
  if (!path) return 'none';
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'html' || ext === 'htm') return path.includes('slides') || path.endsWith('.reveal.html') ? 'slides' : 'html';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif'].includes(ext)) return 'image';
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx';
  if (ext === 'pptx') return 'pptx';
  return 'none';
}
