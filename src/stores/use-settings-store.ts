'use client';

import { create } from 'zustand';

interface SettingsState {
  rulesModalOpen: boolean;
  openRulesModal: () => void;
  closeRulesModal: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  rulesModalOpen: false,
  openRulesModal: () => set({ rulesModalOpen: true }),
  closeRulesModal: () => set({ rulesModalOpen: false }),
}));
