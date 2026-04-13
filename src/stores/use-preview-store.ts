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
  /** Slide edit mode: when true, selected slide shows HTML editor + prompt input */
  slideEditMode: boolean;
  /** Generic edit mode for HTML/Markdown preview: split-view editor + live preview */
  editMode: boolean;
  /** Index of the currently selected slide (0-based) */
  selectedSlideIndex: number;
  /**
   * Rendered HTML cached by preview components (docx/xlsx/pptx/image).
   * Enables PDF-via-print and other cross-format exports for file-backed types.
   */
  renderedHtml: string | null;
  setFile: (path: string | null) => void;
  setPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  toggleFullscreen: () => void;
  setFullscreen: (value: boolean) => void;
  setViewMode: (mode: PreviewViewMode) => void;
  toggleViewMode: () => void;
  setEditMode: (enabled: boolean) => void;
  toggleEditMode: () => void;
  setSlideEditMode: (enabled: boolean) => void;
  toggleSlideEditMode: () => void;
  setSelectedSlideIndex: (index: number) => void;
  setRenderedHtml: (html: string | null) => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  currentFile: null,
  pageNumber: 1,
  zoom: 1,
  fullscreen: false,
  viewMode: 'rendered',
  slideEditMode: false,
  editMode: false,
  selectedSlideIndex: 0,
  renderedHtml: null,
  setFile: (currentFile) => set({ currentFile, pageNumber: 1, viewMode: 'rendered', slideEditMode: false, editMode: false, selectedSlideIndex: 0, renderedHtml: null }),
  setPage: (pageNumber) => set({ pageNumber }),
  setZoom: (zoom) => set({ zoom }),
  toggleFullscreen: () => set((s) => ({ fullscreen: !s.fullscreen })),
  setFullscreen: (fullscreen) => set({ fullscreen }),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleViewMode: () => set((s) => ({ viewMode: s.viewMode === 'source' ? 'rendered' : 'source' })),
  setEditMode: (editMode) => set({ editMode }),
  toggleEditMode: () => set((s) => ({ editMode: !s.editMode })),
  setSlideEditMode: (slideEditMode) => set({ slideEditMode }),
  toggleSlideEditMode: () => set((s) => ({ slideEditMode: !s.slideEditMode })),
  setSelectedSlideIndex: (selectedSlideIndex) => set({ selectedSlideIndex }),
  setRenderedHtml: (renderedHtml) => set({ renderedHtml }),
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
