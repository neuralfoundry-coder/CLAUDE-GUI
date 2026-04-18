'use client';

import { create } from 'zustand';
import { discardAllBuffers, discardBuffer, getStashedBuffers, type StashedBuffer } from '@/lib/editor/buffer-recovery';

interface RecoveryState {
  buffers: StashedBuffer[];
  /** Modal open state. True when we have any buffers to surface on boot. */
  modalOpen: boolean;

  refresh: () => void;
  openModal: () => void;
  closeModal: () => void;
  discardOne: (path: string) => void;
  discardAll: () => void;
}

export const useRecoveryStore = create<RecoveryState>((set) => ({
  buffers: [],
  modalOpen: false,

  refresh: () => {
    const buffers = getStashedBuffers();
    set({ buffers, modalOpen: buffers.length > 0 });
  },

  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),

  discardOne: (path) => {
    discardBuffer(path);
    set((s) => ({
      buffers: s.buffers.filter((b) => b.path !== path),
    }));
  },

  discardAll: () => {
    discardAllBuffers();
    set({ buffers: [], modalOpen: false });
  },
}));
