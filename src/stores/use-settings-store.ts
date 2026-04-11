'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DEFAULT_TERMINAL_FONT_FAMILY = 'JetBrains Mono, Menlo, monospace';

interface SettingsState {
  rulesModalOpen: boolean;
  terminalFontFamily: string;
  terminalFontLigatures: boolean;
  terminalCopyOnSelect: boolean;
  openRulesModal: () => void;
  closeRulesModal: () => void;
  setTerminalFontFamily: (family: string) => void;
  setTerminalFontLigatures: (enabled: boolean) => void;
  setTerminalCopyOnSelect: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      rulesModalOpen: false,
      terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
      terminalFontLigatures: false,
      terminalCopyOnSelect: false,
      openRulesModal: () => set({ rulesModalOpen: true }),
      closeRulesModal: () => set({ rulesModalOpen: false }),
      setTerminalFontFamily: (terminalFontFamily) =>
        set({ terminalFontFamily: terminalFontFamily || DEFAULT_TERMINAL_FONT_FAMILY }),
      setTerminalFontLigatures: (terminalFontLigatures) => set({ terminalFontLigatures }),
      setTerminalCopyOnSelect: (terminalCopyOnSelect) => set({ terminalCopyOnSelect }),
    }),
    {
      name: 'claudegui-settings',
      version: 1,
      // Do NOT persist modal state.
      partialize: (s) => ({
        terminalFontFamily: s.terminalFontFamily,
        terminalFontLigatures: s.terminalFontLigatures,
        terminalCopyOnSelect: s.terminalCopyOnSelect,
      }),
    },
  ),
);
