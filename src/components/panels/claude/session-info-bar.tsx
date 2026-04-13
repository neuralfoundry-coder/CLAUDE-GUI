'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useShallow } from 'zustand/shallow';
import { cn } from '@/lib/utils';
import { useClaudeStore, type SessionStats } from '@/stores/use-claude-store';
import { useSettingsStore } from '@/stores/use-settings-store';
import { findModelSpec } from '@/lib/claude/model-specs';

const DASH = '-';
const STORAGE_KEY = 'claudegui-session-info-expanded';

function formatNumber(n: number | null): string {
  if (n === null || n === undefined) return DASH;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
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

function formatContextRatio(used: number | null, window: number | null): string {
  if (used === null || window === null || window <= 0) return DASH;
  return `${formatNumber(used)}/${formatNumber(window)}`;
}

function formatContextPercent(used: number | null, window: number | null): string {
  if (used === null || window === null || window <= 0) return DASH;
  const pct = (used / window) * 100;
  if (pct >= 100) return '100%';
  if (pct >= 10) return `${pct.toFixed(0)}%`;
  return `${pct.toFixed(1)}%`;
}

function contextColorClass(used: number | null, window: number | null): string {
  if (used === null || window === null || window <= 0) return '';
  const pct = (used / window) * 100;
  if (pct >= 80) return 'text-red-500';
  if (pct >= 50) return 'text-amber-500';
  return 'text-emerald-500';
}

function progressBarColorClass(used: number | null, window: number | null): string {
  if (used === null || window === null || window <= 0) return 'bg-muted-foreground';
  const pct = (used / window) * 100;
  if (pct >= 80) return 'bg-red-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function contextPercent(used: number | null, window: number | null): number {
  if (used === null || window === null || window <= 0) return 0;
  return Math.min(100, (used / window) * 100);
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
    {
      label: 'Context',
      value:
        stats?.contextWindow && stats?.lastContextTokens !== null
          ? `${formatContextRatio(stats.lastContextTokens, stats.contextWindow)} (${formatContextPercent(stats.lastContextTokens, stats.contextWindow)})`
          : DASH,
    },
    { label: 'Input tokens', value: formatNumber(stats?.inputTokens ?? null) },
    { label: 'Output tokens', value: formatNumber(stats?.outputTokens ?? null) },
    { label: 'Cache read', value: formatNumber(stats?.cacheReadTokens ?? null) },
    { label: 'Updated', value: formatRelative(stats?.lastUpdated ?? null, now) },
  ];
}

interface SessionInfoBarProps {
  tabId?: string;
}

export function SessionInfoBar({ tabId }: SessionInfoBarProps) {
  const storeActiveTabId = useClaudeStore((s) => s.activeTabId);
  const resolvedTabId = tabId ?? storeActiveTabId;
  const activeSessionId = useClaudeStore((s) => {
    const tid = resolvedTabId;
    if (!tid) return null;
    const tab = s.tabs.find((t) => t.id === tid);
    return tab?.sessionId ?? null;
  });
  // Subscribe only to the active session's stats — not the entire Record.
  const stats = useClaudeStore(useShallow((s) => {
    const tid = resolvedTabId;
    if (!tid) return null;
    const tab = s.tabs.find((t) => t.id === tid);
    const sid = tab?.sessionId;
    return sid ? s.sessionStats[sid] ?? null : null;
  }));
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const modelSpec = findModelSpec(stats?.model ?? selectedModel ?? '');

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

  const ctxUsed = stats?.lastContextTokens ?? null;
  const ctxWindow = stats?.contextWindow ?? null;
  const summary = {
    model: stats?.model ?? DASH,
    turns: formatNumber(stats?.numTurns ?? null),
    tokens: stats
      ? formatNumber(stats.inputTokens + stats.outputTokens)
      : DASH,
    updated: formatRelative(stats?.lastUpdated ?? null, now),
    ctxRatio: formatContextRatio(ctxUsed, ctxWindow),
    ctxPercent: formatContextPercent(ctxUsed, ctxWindow),
    ctxColor: contextColorClass(ctxUsed, ctxWindow),
    ctxAvailable: ctxUsed !== null && ctxWindow !== null && ctxWindow > 0,
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
          {summary.ctxAvailable ? (
            <span
              className={cn('flex items-center gap-1 whitespace-nowrap font-medium', summary.ctxColor)}
              title={`Context: ${summary.ctxRatio} tokens (${summary.ctxPercent})`}
            >
              ctx {summary.ctxPercent}
              <span className="inline-block h-[3px] w-10 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn('block h-full rounded-full transition-all', progressBarColorClass(ctxUsed, ctxWindow))}
                  style={{ width: `${contextPercent(ctxUsed, ctxWindow)}%` }}
                />
              </span>
            </span>
          ) : (
            <span className="whitespace-nowrap" title="Context window size not yet reported">
              ctx {DASH}
            </span>
          )}
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">{summary.tokens} tok</span>
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
        <div className="border-t px-2 py-1.5 font-mono">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {expandedRows(stats, activeSessionId, now).map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground/70">{row.label}</span>
                <span className="truncate text-right">{row.value}</span>
              </div>
            ))}
          </div>
          {/* Context progress bar */}
          {stats?.contextWindow && stats.lastContextTokens !== null && (
            <div className="mt-1.5">
              <div className="mb-0.5 flex items-center justify-between text-[9px]">
                <span className="text-muted-foreground/70">Context</span>
                <span className={cn('font-medium', contextColorClass(stats.lastContextTokens, stats.contextWindow))}>
                  {formatNumber(stats.lastContextTokens)} / {formatNumber(stats.contextWindow)} ({formatContextPercent(stats.lastContextTokens, stats.contextWindow)})
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    progressBarColorClass(stats.lastContextTokens, stats.contextWindow),
                  )}
                  style={{ width: `${contextPercent(stats.lastContextTokens, stats.contextWindow)}%` }}
                />
              </div>
            </div>
          )}
          {/* Model spec info */}
          {modelSpec && (
            <div className="mt-1.5 border-t pt-1.5">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground/70">Max output</span>
                  <span>{formatNumber(modelSpec.maxOutput)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground/70">Price (in/out)</span>
                  <span>${modelSpec.inputPricePer1M} / ${modelSpec.outputPricePer1M}</span>
                </div>
              </div>
              {modelSpec.capabilities.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {modelSpec.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-medium text-primary"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
