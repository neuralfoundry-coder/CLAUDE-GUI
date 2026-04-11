'use client';

import { useEffect, useState } from 'react';
import { useFilesWebSocket } from './use-files-websocket';

interface GitStatusData {
  branch: string | null;
  files: Record<string, string>;
  isRepo: boolean;
}

let cache: GitStatusData | null = null;
const listeners = new Set<(data: GitStatusData) => void>();

/**
 * Debounce + single-flight around `/api/git/status` so bursts of watcher
 * file change events (dev server writing `.next/`, large git checkouts,
 * formatters running across many files) collapse into one request. Without
 * this guard a build could fire 100+ calls in a few seconds and trip the
 * `/api/files` rate limiter.
 */
const REFRESH_DEBOUNCE_MS = 400;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let pendingWhileInFlight = false;

async function doRefresh(): Promise<void> {
  try {
    const res = await fetch('/api/git/status');
    const json = await res.json();
    if (json.success) {
      cache = json.data;
      listeners.forEach((l) => l(cache!));
    }
  } catch {
    /* ignore */
  }
}

async function runRefresh(): Promise<void> {
  if (inFlight) {
    // Collapse any further triggers into a single trailing refresh.
    pendingWhileInFlight = true;
    return inFlight;
  }
  inFlight = doRefresh();
  try {
    await inFlight;
  } finally {
    inFlight = null;
    if (pendingWhileInFlight) {
      pendingWhileInFlight = false;
      scheduleRefresh();
    }
  }
}

function scheduleRefresh(): void {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void runRefresh();
  }, REFRESH_DEBOUNCE_MS);
}

export function useGitStatus(): { statusMap: Record<string, string>; branch: string | null } {
  const [data, setData] = useState<GitStatusData>(
    cache ?? { branch: null, files: {}, isRepo: false },
  );

  useEffect(() => {
    listeners.add(setData);
    if (!cache) void runRefresh();
    return () => {
      listeners.delete(setData);
    };
  }, []);

  useFilesWebSocket((event) => {
    if (event.event === 'ready') return;
    scheduleRefresh();
  });

  return { statusMap: data.files, branch: data.branch };
}
