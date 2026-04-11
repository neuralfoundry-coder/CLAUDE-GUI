'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { filesApi } from '@/lib/api-client';
import type { FileEntry } from '@/types/files';
import { useFilesWebSocket } from './use-files-websocket';
import { useProjectStore } from '@/stores/use-project-store';

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeNode[];
}

function entryToNode(entry: FileEntry, parentPath: string): TreeNode {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  const node: TreeNode = {
    id: path,
    name: entry.name,
    path,
    isDirectory: entry.type === 'directory',
  };
  if (entry.type === 'directory') {
    node.children = [];
  }
  return node;
}

function updateNodeInTree(
  nodes: TreeNode[],
  targetPath: string,
  updater: (node: TreeNode) => TreeNode,
): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return updater(n);
    if (n.children && targetPath.startsWith(`${n.path}/`)) {
      return { ...n, children: updateNodeInTree(n.children, targetPath, updater) };
    }
    return n;
  });
}

export function useFileTree() {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [loadedPaths, setLoadedPaths] = useState<Set<string>>(() => new Set(['']));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const activeRoot = useProjectStore((s) => s.activeRoot);
  const pendingPathsRef = useRef<Set<string>>(new Set());
  const flushFrameRef = useRef<number | null>(null);

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
      setLoadedPaths(new Set(['']));
      setLastSyncedAt(Date.now());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadDirectory]);

  const loadSubtree = useCallback(
    async (path: string) => {
      if (loadedPaths.has(path)) return;
      try {
        const children = await loadDirectory(path);
        setRootNodes((prev) =>
          updateNodeInTree(prev, path, (node) => ({ ...node, children })),
        );
        setLoadedPaths((prev) => new Set(prev).add(path));
      } catch (err) {
        console.error('[file-tree] loadSubtree failed', err);
      }
    },
    [loadDirectory, loadedPaths],
  );

  const refreshPath = useCallback(
    async (changedPath: string) => {
      const parent = changedPath.split('/').slice(0, -1).join('/');
      try {
        const siblings = await loadDirectory(parent);
        setRootNodes((prev) => {
          if (parent === '') return siblings;
          return updateNodeInTree(prev, parent, (node) => ({ ...node, children: siblings }));
        });
        setLastSyncedAt(Date.now());
      } catch {
        /* ignore */
      }
    },
    [loadDirectory],
  );

  const flushPending = useCallback(() => {
    flushFrameRef.current = null;
    const paths = Array.from(pendingPathsRef.current);
    pendingPathsRef.current.clear();
    const seenParents = new Set<string>();
    for (const p of paths) {
      const parent = p.split('/').slice(0, -1).join('/');
      if (seenParents.has(parent)) continue;
      seenParents.add(parent);
      void refreshPath(p);
    }
  }, [refreshPath]);

  const scheduleRefresh = useCallback(
    (changedPath: string) => {
      pendingPathsRef.current.add(changedPath);
      if (flushFrameRef.current !== null) return;
      flushFrameRef.current = requestAnimationFrame(flushPending);
    },
    [flushPending],
  );

  useEffect(() => {
    refreshRoot();
  }, [refreshRoot, activeRoot]);

  useEffect(() => {
    return () => {
      if (flushFrameRef.current !== null) {
        cancelAnimationFrame(flushFrameRef.current);
      }
    };
  }, []);

  useFilesWebSocket((event) => {
    if (event.event === 'ready') return;
    scheduleRefresh(event.path);
  });

  return { rootNodes, loading, error, refreshRoot, loadSubtree, lastSyncedAt };
}
