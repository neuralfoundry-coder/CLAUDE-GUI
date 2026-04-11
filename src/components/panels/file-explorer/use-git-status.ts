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

async function refresh(): Promise<void> {
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

export function useGitStatus(): { statusMap: Record<string, string>; branch: string | null } {
  const [data, setData] = useState<GitStatusData>(cache ?? { branch: null, files: {}, isRepo: false });

  useEffect(() => {
    listeners.add(setData);
    if (!cache) refresh();
    return () => {
      listeners.delete(setData);
    };
  }, []);

  useFilesWebSocket((event) => {
    if (event.event === 'ready') return;
    refresh();
  });

  return { statusMap: data.files, branch: data.branch };
}
