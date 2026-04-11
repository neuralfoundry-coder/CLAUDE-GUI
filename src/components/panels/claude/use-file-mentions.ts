'use client';

import { useCallback, useEffect, useState } from 'react';
import { listProjectFiles, type ProjectFileItem } from '@/lib/fs/list-project-files';
import { useProjectStore } from '@/stores/use-project-store';

export interface MentionMatch {
  start: number;
  query: string;
}

const MAX_RESULTS = 20;

export function detectMention(text: string, cursor: number): MentionMatch | null {
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = text.charAt(i);
    if (ch === '@') {
      const prev = i === 0 ? '' : text.charAt(i - 1);
      if (i === 0 || /\s/.test(prev)) {
        return { start: i, query: text.slice(i + 1, cursor) };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

function fuzzyScore(needle: string, haystack: string): number {
  if (!needle) return 1;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (h === n) return 10_000;
  if (h.startsWith(n)) return 5_000;
  const baseName = h.slice(h.lastIndexOf('/') + 1);
  if (baseName.startsWith(n)) return 3_000;
  const idx = h.indexOf(n);
  if (idx >= 0) return 1_000 - idx;
  let hi = 0;
  for (const ch of n) {
    const found = h.indexOf(ch, hi);
    if (found < 0) return -1;
    hi = found + 1;
  }
  return 10;
}

export function filterMentionCandidates(
  entries: ProjectFileItem[],
  query: string,
): ProjectFileItem[] {
  const scored: Array<{ item: ProjectFileItem; score: number }> = [];
  for (const item of entries) {
    const score = fuzzyScore(query, item.path);
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.path.localeCompare(b.item.path));
  return scored.slice(0, MAX_RESULTS).map((x) => x.item);
}

export function useFileMentions() {
  const [entries, setEntries] = useState<ProjectFileItem[]>([]);
  const activeRoot = useProjectStore((s) => s.activeRoot);

  const refresh = useCallback(async () => {
    const list = await listProjectFiles('', { includeDirectories: true });
    setEntries(list);
  }, []);

  useEffect(() => {
    if (!activeRoot) {
      setEntries([]);
      return;
    }
    refresh();
  }, [activeRoot, refresh]);

  return { entries, refresh };
}
