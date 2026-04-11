'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'high-contrast' | 'retro-green';
export type PanelId = 'fileExplorer' | 'terminal' | 'preview';

interface LayoutState {
  fileExplorerSize: number;
  editorSize: number;
  terminalSize: number;
  previewSize: number;
  fileExplorerCollapsed: boolean;
  terminalCollapsed: boolean;
  previewCollapsed: boolean;
  theme: Theme;
  retroScanlines: boolean;
  fontSize: number;

  setPanelSize: (panel: 'fileExplorer' | 'editor' | 'terminal' | 'preview', size: number) => void;
  togglePanel: (panel: PanelId) => void;
  setTheme: (theme: Theme) => void;
  setRetroScanlines: (enabled: boolean) => void;
  setFontSize: (size: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      fileExplorerSize: 20,
      editorSize: 65,
      terminalSize: 35,
      previewSize: 30,
      fileExplorerCollapsed: false,
      terminalCollapsed: false,
      previewCollapsed: false,
      theme: 'dark',
      retroScanlines: true,
      fontSize: 14,

      setPanelSize: (panel, size) =>
        set((state) => {
          const key = `${panel}Size` as const;
          return { ...state, [key]: size };
        }),

      togglePanel: (panel) =>
        set((state) => {
          const key = `${panel}Collapsed` as const;
          return { ...state, [key]: !state[key] };
        }),

      setTheme: (theme) => set({ theme }),
      setRetroScanlines: (retroScanlines) => set({ retroScanlines }),
      setFontSize: (fontSize) => set({ fontSize }),
      increaseFontSize: () => set((s) => ({ fontSize: Math.min(s.fontSize + 1, 24) })),
      decreaseFontSize: () => set((s) => ({ fontSize: Math.max(s.fontSize - 1, 10) })),
    }),
    {
      name: 'claudegui-layout',
      version: 2,
    },
  ),
);
