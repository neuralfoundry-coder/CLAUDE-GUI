'use client';

import { create } from 'zustand';
import type { AuthStatus } from '@/lib/claude/auth-status';

interface AuthState {
  status: AuthStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: null,
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/auth/status');
      const body = (await res.json()) as { success: boolean; data?: AuthStatus; error?: string };
      if (!body.success || !body.data) {
        throw new Error(body.error ?? 'Failed to load auth status');
      }
      set({ status: body.data, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },
}));
