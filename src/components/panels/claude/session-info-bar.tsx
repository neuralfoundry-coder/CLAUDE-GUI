'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClaudeStore, type SessionStats } from '@/stores/use-claude-store';

const DASH = '-';
const STORAGE_KEY = 'claudegui-session-info-expanded';

function formatNumber(n: number | null): string {
  if (n === null || n === undefined) return DASH;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(n: number | null): string {
  if (n === null || n === undefined || n === 0) return DASH;
  return `$${n.toFixed(4)}`;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return DASH;
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.floor(s % 60);
  return `${m}m ${rs}s`;
}

function formatRelative(ts: number | null, now: number): string {
  if (ts === null) return DASH;
  const diff = Math.max(0, now - ts);
  if (diff < 1000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function truncateSessionId(id: string | null): string {
  if (!id) return DASH;
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

interface Row {
  label: string;
  value: string;
}

function expandedRows(stats: SessionStats | null, activeSessionId: string | null, now: number): Row[] {
  return [
    { label: 'Session', value: truncateSessionId(stats?.sessionId ?? activeSessionId) },
    { label: 'Model', value: stats?.model ?? DASH },
    { label: 'Turns', value: formatNumber(stats?.numTurns ?? null) },
    { label: 'Duration', value: formatDuration(stats?.durationMs ?? null) },
    { label: 'Input tokens', value: formatNumber(stats?.inputTokens ?? null) },
    { label: 'Output tokens', value: formatNumber(stats?.outputTokens ?? null) },
    { label: 'Cache read', value: formatNumber(stats?.cacheReadTokens ?? null) },
    { label: 'Cost', value: formatCost(stats?.costUsd ?? null) },
    { label: 'Updated', value: formatRelative(stats?.lastUpdated ?? null, now) },
  ];
}

export function SessionInfoBar() {
  const activeSessionId = useClaudeStore((s) => s.activeSessionId);
  const sessionStats = useClaudeStore((s) => s.sessionStats);
  const stats = activeSessionId ? sessionStats[activeSessionId] ?? null : null;

  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === '1') setExpanded(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, expanded ? '1' : '0');
    } catch {
      // ignore
    }
  }, [expanded]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const summary = {
    model: stats?.model ?? DASH,
    turns: formatNumber(stats?.numTurns ?? null),
    tokens: stats
      ? formatNumber(stats.inputTokens + stats.outputTokens)
      : DASH,
    cost: formatCost(stats?.costUsd ?? null),
    updated: formatRelative(stats?.lastUpdated ?? null, now),
  };

  return (
    <div className="border-t bg-muted/30 text-[10px] text-muted-foreground">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex h-6 w-full items-center justify-between gap-2 px-2',
          'hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring',
        )}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse session info' : 'Expand session info'}
        title="Session info"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="truncate font-mono">{summary.model}</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">{summary.turns} turns</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">{summary.tokens} tok</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">{summary.cost}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="whitespace-nowrap">{summary.updated}</span>
          {expanded ? (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t px-2 py-1.5 font-mono">
          {expandedRows(stats, activeSessionId, now).map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground/70">{row.label}</span>
              <span className="truncate text-right">{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
