'use client';

import { useClaudeStore } from '@/stores/use-claude-store';
import { useRemoteAccessStore } from '@/stores/use-remote-access-store';
import { ConnectionIndicator } from './connection-indicator';

export function StatusBar() {
  const totalCost = useClaudeStore((s) => s.totalCost);
  const isStreaming = useClaudeStore((s) => s.isStreaming);
  const activeSession = useClaudeStore((s) => s.activeSessionId);
  const remoteAccess = useRemoteAccessStore((s) => s.remoteAccess);
  const localIPs = useRemoteAccessStore((s) => s.localIPs);

  return (
    <footer className="flex h-6 items-center justify-between border-t bg-muted px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>{activeSession ? `Session: ${activeSession.slice(0, 8)}` : 'No session'}</span>
        <span>Claude: {isStreaming ? 'streaming' : 'idle'}</span>
      </div>
      <div className="flex items-center gap-3">
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
