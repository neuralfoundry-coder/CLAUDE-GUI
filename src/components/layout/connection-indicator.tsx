'use client';

import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useConnectionStore, getOverallStatus } from '@/stores/use-connection-store';
import { cn } from '@/lib/utils';

export function ConnectionIndicator() {
  const statuses = useConnectionStore((s) => s.statuses);
  const overall = getOverallStatus(statuses);

  const label =
    overall === 'open' ? 'Connected' : overall === 'connecting' ? 'Connecting…' : 'Disconnected';

  const details = `Claude: ${statuses.claude} · Terminal: ${statuses.terminal} · Files: ${statuses.files}`;

  const Icon = overall === 'open' ? Wifi : overall === 'connecting' ? Loader2 : WifiOff;

  return (
    <div
      className={cn(
        'flex items-center gap-1 text-xs',
        overall === 'open' && 'text-muted-foreground',
        overall === 'connecting' && 'text-yellow-500',
        overall === 'closed' && 'text-destructive',
      )}
      title={details}
      aria-label={`WebSocket status: ${label}`}
      role="status"
    >
      <Icon className={cn('h-3 w-3', overall === 'connecting' && 'animate-spin')} />
      <span>{label}</span>
    </div>
  );
}
