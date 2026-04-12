'use client';

import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, CircleOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/use-auth-store';

interface AuthBadgeProps {
  onRequestLogin?: () => void;
}

export function AuthBadge({ onRequestLogin }: AuthBadgeProps) {
  const status = useAuthStore((s) => s.status);
  const loading = useAuthStore((s) => s.loading);
  const refresh = useAuthStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 15000);
    return () => clearInterval(id);
  }, [refresh]);

  if (loading && !status) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Claude
      </span>
    );
  }

  if (!status) return null;

  if (!status.cliInstalled) {
    return (
      <button
        type="button"
        onClick={onRequestLogin}
        className="flex items-center gap-1 rounded-md border border-muted-foreground/40 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
        aria-label="Claude CLI not installed"
        title="Claude CLI not installed"
      >
        <CircleOff className="h-3 w-3" aria-hidden="true" />
        CLI missing
      </button>
    );
  }

  if (!status.authenticated) {
    return (
      <button
        type="button"
        onClick={onRequestLogin}
        className="flex items-center gap-1 rounded-md border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
        aria-label="Claude CLI not signed in"
        title="Click to sign in"
      >
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
        Sign in
      </button>
    );
  }

  const displayName = status.email
    ? status.email.split('@')[0]
    : status.orgName ?? 'Claude';
  const tooltip = status.email
    ? `${status.email}${status.orgName ? ` (${status.orgName})` : ''}`
    : `Signed in (${status.source})`;

  return (
    <span
      className="flex items-center gap-1 rounded-md border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400"
      aria-label={`Claude authenticated via ${status.source}`}
      title={tooltip}
    >
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      {displayName}
    </span>
  );
}
