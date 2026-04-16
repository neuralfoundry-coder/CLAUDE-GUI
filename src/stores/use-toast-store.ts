'use client';

import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type: 'error' | 'success' | 'info';
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, type = 'error') => {
    const id = `toast-${++counter}-${Date.now()}`;
    set((s) => ({
      toasts: [...s.toasts.slice(-4), { id, message, type, createdAt: Date.now() }],
    }));
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
