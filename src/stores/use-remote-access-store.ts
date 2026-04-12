'use client';

import { create } from 'zustand';
import { isTauri } from '@/lib/runtime';

interface RemoteAccessState {
  // Server status
  remoteAccess: boolean;
  hasToken: boolean;
  token: string | null;
  hostname: string;
  port: number;
  localIPs: string[];
  loading: boolean;
  restarting: boolean;

  // Modal
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;

  // Actions
  fetchStatus: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  updateConfig: (remoteAccess: boolean, options?: { token?: string | null; generateToken?: boolean }) => Promise<void>;
  restartServer: () => Promise<boolean>;
}

export const useRemoteAccessStore = create<RemoteAccessState>((set, get) => ({
  remoteAccess: false,
  hasToken: false,
  token: null,
  hostname: '127.0.0.1',
  port: 3000,
  localIPs: [],
  loading: false,
  restarting: false,
  modalOpen: false,

  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),

  fetchStatus: async () => {
    try {
      const res = await fetch('/api/server/status');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        set({
          hostname: json.data.hostname,
          port: json.data.port,
          remoteAccess: json.data.remoteAccess,
          hasToken: json.data.hasToken,
          localIPs: json.data.localIPs,
        });
      }
    } catch {
      /* ignore — server may not support this yet */
    }
  },

  fetchConfig: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/server/config');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        set({
          remoteAccess: json.data.remoteAccess,
          token: json.data.remoteAccessToken,
          hasToken: !!json.data.remoteAccessToken,
        });
      }
    } catch {
      /* ignore */
    } finally {
      set({ loading: false });
    }
  },

  updateConfig: async (remoteAccess, options) => {
    set({ loading: true });
    try {
      const body: Record<string, unknown> = { remoteAccess };
      if (options?.token !== undefined) body.remoteAccessToken = options.token;
      if (options?.generateToken) body.generateToken = true;

      const res = await fetch('/api/server/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        set({
          remoteAccess: json.data.remoteAccess,
          token: json.data.remoteAccessToken,
          hasToken: !!json.data.remoteAccessToken,
        });
      }
    } catch {
      /* ignore */
    } finally {
      set({ loading: false });
    }
  },

  restartServer: async () => {
    set({ restarting: true });
    try {
      // In Tauri, use IPC to restart the sidecar process
      if (isTauri()) {
        try {
          // Dynamic import to avoid build-time dependency on @tauri-apps/api
          const mod = await import(/* webpackIgnore: true */ '@tauri-apps/api/core' as string);
          await mod.invoke('restart_server');
          await get().fetchStatus();
          await get().fetchConfig();
          set({ restarting: false });
          return true;
        } catch {
          set({ restarting: false });
          return false;
        }
      }

      // Standalone mode: use HTTP API
      const res = await fetch('/api/server/restart', { method: 'POST' });
      if (!res.ok) {
        set({ restarting: false });
        return false;
      }

      // Poll /api/health until server comes back (max 15s)
      const deadline = Date.now() + 15_000;
      // Wait a moment for the server to start shutting down
      await new Promise((r) => setTimeout(r, 500));

      while (Date.now() < deadline) {
        try {
          const health = await fetch('/api/health');
          if (health.ok) {
            // Server is back — refresh status
            await get().fetchStatus();
            await get().fetchConfig();
            set({ restarting: false });
            return true;
          }
        } catch {
          /* server still restarting */
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      set({ restarting: false });
      return false;
    } catch {
      set({ restarting: false });
      return false;
    }
  },
}));
