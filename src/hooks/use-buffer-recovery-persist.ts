'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/stores/use-editor-store';
import { discardBuffer, stashBuffer } from '@/lib/editor/buffer-recovery';

const DEBOUNCE_MS = 1000;

/**
 * Observes editor tabs and debounce-persists dirty buffer content to
 * localStorage so it survives a browser crash / server restart. Saved tabs
 * are discarded from the recovery stash. Best-effort — oversized buffers
 * (>256KB) are skipped by the underlying storage module.
 */
export function useBufferRecoveryPersist(): void {
  useEffect(() => {
    // path → last content we stashed. Avoids redundant writes when a tab
    // re-renders without content change.
    const lastStashed = new Map<string, string>();
    // path → timer
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const scheduleStash = (path: string, content: string) => {
      if (lastStashed.get(path) === content) return;
      const existing = timers.get(path);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        stashBuffer(path, content);
        lastStashed.set(path, content);
        timers.delete(path);
      }, DEBOUNCE_MS);
      timers.set(path, t);
    };

    const cancelStash = (path: string) => {
      const t = timers.get(path);
      if (t) {
        clearTimeout(t);
        timers.delete(path);
      }
      lastStashed.delete(path);
    };

    let prevTabs = useEditorStore.getState().tabs;

    const unsub = useEditorStore.subscribe((state) => {
      const tabs = state.tabs;

      // Detect closed tabs → cancel any pending stash.
      const currentPaths = new Set(tabs.map((t) => t.path));
      for (const prev of prevTabs) {
        if (!currentPaths.has(prev.path)) cancelStash(prev.path);
      }

      for (const tab of tabs) {
        if (tab.dirty) {
          scheduleStash(tab.path, tab.content);
        } else {
          // Tab became clean (saved/reset) → discard recovery.
          if (lastStashed.has(tab.path)) {
            cancelStash(tab.path);
            discardBuffer(tab.path);
          }
        }
      }

      prevTabs = tabs;
    });

    return () => {
      unsub();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);
}
