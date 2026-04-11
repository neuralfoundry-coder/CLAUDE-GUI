'use client';

import { create } from 'zustand';

export type ConnectionEndpoint = 'claude' | 'terminal' | 'files';
export type ConnectionStatus = 'connecting' | 'open' | 'closed';

interface ConnectionState {
  statuses: Record<ConnectionEndpoint, ConnectionStatus>;
  setStatus: (endpoint: ConnectionEndpoint, status: ConnectionStatus) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  statuses: {
    claude: 'connecting',
    terminal: 'connecting',
    files: 'connecting',
  },
  setStatus: (endpoint, status) =>
    set((s) => ({ statuses: { ...s.statuses, [endpoint]: status } })),
}));

export function getOverallStatus(statuses: Record<ConnectionEndpoint, ConnectionStatus>):
  ConnectionStatus {
  const vals = Object.values(statuses);
  if (vals.every((v) => v === 'open')) return 'open';
  if (vals.some((v) => v === 'open')) return 'connecting';
  if (vals.every((v) => v === 'closed')) return 'closed';
  return 'connecting';
}
