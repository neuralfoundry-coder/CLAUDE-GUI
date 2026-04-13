'use client';

import { useClaudeStore } from '@/stores/use-claude-store';
import { useRemoteAccessStore } from '@/stores/use-remote-access-store';
import { useMcpStore } from '@/stores/use-mcp-store';
import { ConnectionIndicator } from './connection-indicator';

export function StatusBar() {
  const totalCost = useClaudeStore((s) => s.totalCost);
  const isStreaming = useClaudeStore((s) => s.isStreaming);
  const activeSession = useClaudeStore((s) => s.activeSessionId);
  const remoteAccess = useRemoteAccessStore((s) => s.remoteAccess);
  const localIPs = useRemoteAccessStore((s) => s.localIPs);
  const mcpServers = useMcpStore((s) => s.servers);
  const mcpStatuses = useMcpStore((s) => s.statuses);
  const openMcpModal = useMcpStore((s) => s.openModal);

  const enabledMcpCount = Object.values(mcpServers).filter((s) => s.enabled).length;
  const mcpStatusColor = (() => {
    if (enabledMcpCount === 0) return '';
    if (mcpStatuses.some((s) => s.status === 'failed')) return 'text-red-500';
    if (mcpStatuses.some((s) => s.status === 'pending')) return 'text-yellow-500';
    if (mcpStatuses.length > 0 && mcpStatuses.every((s) => s.status === 'connected')) return 'text-green-500';
    return 'text-blue-500';
  })();

  return (
    <footer className="flex h-6 items-center justify-between border-t glass-surface px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>{activeSession ? `Session: ${activeSession.slice(0, 8)}` : 'No session'}</span>
        <span>Claude: {isStreaming ? 'streaming' : 'idle'}</span>
      </div>
      <div className="flex items-center gap-3">
        {enabledMcpCount > 0 && (
          <button
            className={`hover:underline ${mcpStatusColor}`}
            onClick={openMcpModal}
          >
            MCP: {enabledMcpCount} server{enabledMcpCount !== 1 ? 's' : ''}
          </button>
        )}
        {remoteAccess && (
          <span className="text-green-500">
            Remote ({localIPs[0] ?? '0.0.0.0'})
          </span>
        )}
        <ConnectionIndicator />
        <span>Cost: ${totalCost.toFixed(4)}</span>
      </div>
    </footer>
  );
}
