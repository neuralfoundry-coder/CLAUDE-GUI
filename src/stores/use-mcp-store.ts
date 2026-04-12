'use client';

import { create } from 'zustand';
import type { McpServerEntry } from '@/lib/claude/settings-manager';

interface McpServerStatusInfo {
  name: string;
  status: 'connected' | 'failed' | 'needs-auth' | 'pending';
  serverInfo?: { name: string; version: string };
}

interface McpState {
  servers: Record<string, McpServerEntry>;
  statuses: McpServerStatusInfo[];
  loading: boolean;
  modalOpen: boolean;

  openModal: () => void;
  closeModal: () => void;
  fetchServers: () => Promise<void>;
  saveServers: (servers: Record<string, McpServerEntry>) => Promise<boolean>;
  fetchStatus: () => Promise<void>;
  addServer: (name: string, entry: McpServerEntry) => void;
  removeServer: (name: string) => void;
  toggleServer: (name: string) => void;
  updateServer: (name: string, entry: McpServerEntry) => void;
}

export const useMcpStore = create<McpState>((set) => ({
  servers: {},
  statuses: [],
  loading: false,
  modalOpen: false,

  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),

  fetchServers: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/mcp');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        set({ servers: json.data.mcpServers ?? {} });
      }
    } catch {
      /* ignore */
    } finally {
      set({ loading: false });
    }
  },

  saveServers: async (servers) => {
    set({ loading: true });
    try {
      const res = await fetch('/api/mcp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcpServers: servers }),
      });
      if (!res.ok) return false;
      const json = await res.json();
      if (json.success) {
        set({ servers: json.data.mcpServers ?? servers });
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      set({ loading: false });
    }
  },

  fetchStatus: async () => {
    try {
      const res = await fetch('/api/mcp/status');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        set({ statuses: json.data.statuses ?? [] });
      }
    } catch {
      /* ignore */
    }
  },

  addServer: (name, entry) => {
    set((state) => ({
      servers: { ...state.servers, [name]: entry },
    }));
  },

  removeServer: (name) => {
    set((state) => {
      const next = { ...state.servers };
      delete next[name];
      return { servers: next };
    });
  },

  toggleServer: (name) => {
    set((state) => {
      const entry = state.servers[name];
      if (!entry) return state;
      return {
        servers: {
          ...state.servers,
          [name]: { ...entry, enabled: !entry.enabled },
        },
      };
    });
  },

  updateServer: (name, entry) => {
    set((state) => ({
      servers: { ...state.servers, [name]: entry },
    }));
  },
}));
