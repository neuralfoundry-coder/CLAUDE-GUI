'use client';

import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';

/**
 * Throttled localStorage adapter — defers writes by up to 1 second so that
 * rapid state changes (e.g. panel resize drag) don't block the main thread
 * with 60× JSON.stringify + localStorage.setItem per second.  A synchronous
 * flush is scheduled on `beforeunload` to avoid losing the latest state.
 */
function createThrottledStorage<T>(): PersistStorage<T> {
  let pendingValue: StorageValue<T> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (name: string) => {
    if (pendingValue === null) return;
    try {
      localStorage.setItem(name, JSON.stringify(pendingValue));
    } catch { /* quota exceeded — silently drop */ }
    pendingValue = null;
    timer = null;
  };

  // Capture the storage name for the beforeunload handler.
  let storageName = '';

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (storageName && pendingValue !== null) {
        flush(storageName);
      }
    });
  }

  return {
    getItem: (name) => {
      storageName = name;
      const raw = localStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<T>) : null;
    },
    setItem: (name, value) => {
      storageName = name;
      pendingValue = value;
      if (timer) return; // already scheduled
      timer = setTimeout(() => flush(name), 1_000);
    },
    removeItem: (name) => {
      pendingValue = null;
      if (timer) { clearTimeout(timer); timer = null; }
      localStorage.removeItem(name);
    },
  };
}

export type Theme = 'dark' | 'light' | 'high-contrast' | 'retro-green' | 'system';
export type PanelId = 'fileExplorer' | 'editor' | 'terminal' | 'claude' | 'preview';

export const DEFAULT_PANEL_SIZES = {
  fileExplorer: 18,
  center: 52,
  editor: 60,
  terminal: 40,
  claude: 15,
  preview: 15,
} as const;

interface LayoutState {
  fileExplorerSize: number;
  editorSize: number;
  terminalSize: number;
  previewSize: number;
  fileExplorerCollapsed: boolean;
  editorCollapsed: boolean;
  terminalCollapsed: boolean;
  claudeCollapsed: boolean;
  previewCollapsed: boolean;
  theme: Theme;
  retroScanlines: boolean;
  fontSize: number;
  mobileActivePanel: PanelId;

  setPanelSize: (panel: 'fileExplorer' | 'editor' | 'terminal' | 'preview', size: number) => void;
  togglePanel: (panel: PanelId) => void;
  setCollapsed: (panel: PanelId, collapsed: boolean) => void;
  resetPanelSizes: () => void;
  setTheme: (theme: Theme) => void;
  setRetroScanlines: (enabled: boolean) => void;
  setFontSize: (size: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  setMobileActivePanel: (panel: PanelId) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      fileExplorerSize: 20,
      editorSize: 65,
      terminalSize: 35,
      previewSize: 30,
      fileExplorerCollapsed: false,
      editorCollapsed: false,
      terminalCollapsed: false,
      claudeCollapsed: false,
      previewCollapsed: false,
      theme: 'dark',
      retroScanlines: true,
      fontSize: 14,
      mobileActivePanel: 'editor' as PanelId,

      setPanelSize: (panel, size) =>
        set((state) => {
          const key = `${panel}Size` as const;
          return { ...state, [key]: size };
        }),

      togglePanel: (panel) =>
        set((state) => {
          const key = `${panel}Collapsed` as keyof LayoutState;
          return { ...state, [key]: !state[key] };
        }),

      setCollapsed: (panel, collapsed) =>
        set((state) => {
          const key = `${panel}Collapsed` as keyof LayoutState;
          return { ...state, [key]: collapsed };
        }),

      resetPanelSizes: () =>
        set({
          fileExplorerCollapsed: false,
          editorCollapsed: false,
          terminalCollapsed: false,
          claudeCollapsed: false,
          previewCollapsed: false,
        }),

      setTheme: (theme) => set({ theme }),
      setRetroScanlines: (retroScanlines) => set({ retroScanlines }),
      setFontSize: (fontSize) => set({ fontSize }),
      increaseFontSize: () => set((s) => ({ fontSize: Math.min(s.fontSize + 1, 24) })),
      decreaseFontSize: () => set((s) => ({ fontSize: Math.max(s.fontSize - 1, 10) })),
      setMobileActivePanel: (mobileActivePanel) => set({ mobileActivePanel }),
    }),
    {
      name: 'claudegui-layout',
      storage: createThrottledStorage<LayoutState>(),
      version: 3,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 3) {
          // Add new collapsed states and mobileActivePanel for v3
          if (state.editorCollapsed === undefined) state.editorCollapsed = false;
          if (state.claudeCollapsed === undefined) state.claudeCollapsed = false;
          if (state.mobileActivePanel === undefined) state.mobileActivePanel = 'editor';
        }
        return state as unknown as LayoutState;
      },
    },
  ),
);
