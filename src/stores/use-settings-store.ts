'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DEFAULT_TERMINAL_FONT_FAMILY = 'JetBrains Mono, Menlo, monospace';

type RenderWhitespace = 'none' | 'boundary' | 'all';

interface SettingsState {
  rulesModalOpen: boolean;
  terminalFontFamily: string;
  terminalFontLigatures: boolean;
  terminalCopyOnSelect: boolean;
  selectedModel: string | null;

  // Editor settings
  editorWordWrap: boolean;
  editorTabSize: number;
  editorUseSpaces: boolean;
  editorMinimapEnabled: boolean;
  editorRenderWhitespace: RenderWhitespace;
  editorStickyScroll: boolean;
  editorBracketColors: boolean;
  editorCompletionEnabled: boolean;
  editorCompletionDelay: number;
  editorVimMode: boolean;

  // Actions
  openRulesModal: () => void;
  closeRulesModal: () => void;
  setTerminalFontFamily: (family: string) => void;
  setTerminalFontLigatures: (enabled: boolean) => void;
  setTerminalCopyOnSelect: (enabled: boolean) => void;
  setSelectedModel: (modelId: string | null) => void;
  setEditorWordWrap: (enabled: boolean) => void;
  setEditorTabSize: (size: number) => void;
  setEditorUseSpaces: (enabled: boolean) => void;
  setEditorMinimapEnabled: (enabled: boolean) => void;
  setEditorRenderWhitespace: (mode: RenderWhitespace) => void;
  setEditorStickyScroll: (enabled: boolean) => void;
  setEditorBracketColors: (enabled: boolean) => void;
  setEditorCompletionEnabled: (enabled: boolean) => void;
  setEditorCompletionDelay: (delay: number) => void;
  setEditorVimMode: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      rulesModalOpen: false,
      terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
      terminalFontLigatures: false,
      terminalCopyOnSelect: false,
      selectedModel: null,

      // Editor defaults
      editorWordWrap: false,
      editorTabSize: 2,
      editorUseSpaces: true,
      editorMinimapEnabled: true,
      editorRenderWhitespace: 'none',
      editorStickyScroll: true,
      editorBracketColors: true,
      editorCompletionEnabled: true,
      editorCompletionDelay: 500,
      editorVimMode: false,

      openRulesModal: () => set({ rulesModalOpen: true }),
      closeRulesModal: () => set({ rulesModalOpen: false }),
      setTerminalFontFamily: (terminalFontFamily) =>
        set({ terminalFontFamily: terminalFontFamily || DEFAULT_TERMINAL_FONT_FAMILY }),
      setTerminalFontLigatures: (terminalFontLigatures) => set({ terminalFontLigatures }),
      setTerminalCopyOnSelect: (terminalCopyOnSelect) => set({ terminalCopyOnSelect }),
      setSelectedModel: (selectedModel) => set({ selectedModel }),
      setEditorWordWrap: (editorWordWrap) => set({ editorWordWrap }),
      setEditorTabSize: (editorTabSize) => set({ editorTabSize }),
      setEditorUseSpaces: (editorUseSpaces) => set({ editorUseSpaces }),
      setEditorMinimapEnabled: (editorMinimapEnabled) => set({ editorMinimapEnabled }),
      setEditorRenderWhitespace: (editorRenderWhitespace) => set({ editorRenderWhitespace }),
      setEditorStickyScroll: (editorStickyScroll) => set({ editorStickyScroll }),
      setEditorBracketColors: (editorBracketColors) => set({ editorBracketColors }),
      setEditorCompletionEnabled: (editorCompletionEnabled) => set({ editorCompletionEnabled }),
      setEditorCompletionDelay: (editorCompletionDelay) => set({ editorCompletionDelay }),
      setEditorVimMode: (editorVimMode) => set({ editorVimMode }),
    }),
    {
      name: 'claudegui-settings',
      version: 3,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          // Add editor settings defaults for v1 → v2 migration
          return {
            ...state,
            editorWordWrap: false,
            editorTabSize: 2,
            editorUseSpaces: true,
            editorMinimapEnabled: true,
            editorRenderWhitespace: 'none',
            editorStickyScroll: true,
            editorBracketColors: true,
            editorCompletionEnabled: true,
            editorCompletionDelay: 500,
            editorVimMode: false,
          };
        }
        if (version < 3) {
          return {
            ...state,
            editorVimMode: false,
          };
        }
        return state;
      },
      // Do NOT persist modal state.
      partialize: (s) => ({
        terminalFontFamily: s.terminalFontFamily,
        terminalFontLigatures: s.terminalFontLigatures,
        terminalCopyOnSelect: s.terminalCopyOnSelect,
        selectedModel: s.selectedModel,
        editorWordWrap: s.editorWordWrap,
        editorTabSize: s.editorTabSize,
        editorUseSpaces: s.editorUseSpaces,
        editorMinimapEnabled: s.editorMinimapEnabled,
        editorRenderWhitespace: s.editorRenderWhitespace,
        editorStickyScroll: s.editorStickyScroll,
        editorBracketColors: s.editorBracketColors,
        editorCompletionEnabled: s.editorCompletionEnabled,
        editorCompletionDelay: s.editorCompletionDelay,
        editorVimMode: s.editorVimMode,
      }),
    },
  ),
);
