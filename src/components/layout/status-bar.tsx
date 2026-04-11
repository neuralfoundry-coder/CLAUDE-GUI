'use client';

import { useClaudeStore } from '@/stores/use-claude-store';

export function StatusBar() {
  const totalCost = useClaudeStore((s) => s.totalCost);
  const isStreaming = useClaudeStore((s) => s.isStreaming);
  const activeSession = useClaudeStore((s) => s.activeSessionId);

  return (
    <footer className="flex h-6 items-center justify-between border-t bg-muted px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>{activeSession ? `Session: ${activeSession.slice(0, 8)}` : 'No session'}</span>
        <span>Claude: {isStreaming ? 'streaming' : 'idle'}</span>
      </div>
      <div className="flex items-center gap-3">
        <span>Cost: ${totalCost.toFixed(4)}</span>
      </div>
    </footer>
  );
}
