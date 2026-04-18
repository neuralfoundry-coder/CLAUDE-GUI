'use client';

import { useEffect, useState } from 'react';

interface RelativeTimeProps {
  timestamp: number | null;
  /** Fallback label when timestamp is null. Defaults to 'never'. */
  fallback?: string;
  /** Update interval in ms. Defaults to 1000. */
  intervalMs?: number;
}

function formatRelative(ts: number | null, now: number, fallback: string): string {
  if (ts === null) return fallback;
  const delta = Math.max(0, Math.floor((now - ts) / 1000));
  if (delta < 2) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3600)}h ago`;
}

/**
 * Renders a human-readable relative time that ticks forward.
 *
 * Isolated as its own component so the `now` state update every tick re-renders
 * only this label — not the whole surrounding panel. Ticking pauses when the
 * document is hidden (Page Visibility API) to avoid wasted work on background
 * tabs.
 */
export function RelativeTime({
  timestamp,
  fallback = 'never',
  intervalMs = 1000,
}: RelativeTimeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => setNow(Date.now()), intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        stop();
      } else {
        setNow(Date.now());
        start();
      }
    };

    if (typeof document === 'undefined' || !document.hidden) start();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    return () => {
      stop();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [intervalMs]);

  return <>{formatRelative(timestamp, now, fallback)}</>;
}
