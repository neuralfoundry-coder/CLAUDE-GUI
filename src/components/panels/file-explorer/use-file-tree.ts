'use client';

import { useCallback, useEffect, useState } from 'react';
import { filesApi } from '@/lib/api-client';
import type { FileEntry } from '@/types/files';
import { useFilesWebSocket } from './use-files-websocket';

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeNode[] | null;
}

function entryToNode(entry: FileEntry, parentPath: string): TreeNode {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  return {
    id: path,
    name: entry.name,
    path,
    isDirectory: entry.type === 'directory',
    children: entry.type === 'directory' ? null : undefined,
  };
}

export function useFileTree() {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    const res = await filesApi.list(dirPath);
    return res.entries.map((e) => entryToNode(e, dirPath));
  }, []);

  const refreshRoot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nodes = await loadDirectory('');
      setRootNodes(nodes);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadDirectory]);

  useEffect(() => {
    refreshRoot();
  }, [refreshRoot]);

  useFilesWebSocket((event) => {
    if (event.event === 'ready') return;
    refreshRoot();
  });

  return { rootNodes, loading, error, refreshRoot, loadDirectory };
}
