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
  const loadedPathsRef = useRef<Set<string>>(new Set(['']));

  // Keep the ref in sync with state so refreshRoot can read it synchronously.
  useEffect(() => {
    loadedPathsRef.current = loadedPaths;
  }, [loadedPaths]);

  const loadDirectory = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    const res = await filesApi.list(dirPath);
    return res.entries.map((e) => entryToNode(e, dirPath));
  }, []);

  const initialLoadDone = useRef(false);

  const refreshRoot = useCallback(async () => {
    if (!activeRoot) {
      setRootNodes([]);
      setLoadedPaths(new Set(['']));
      setLoading(false);
      setError(null);
      initialLoadDone.current = false;
      return;
    }
    // Only show the loading spinner on the very first load so that
    // subsequent refreshes don't unmount the tree (which destroys
    // react-arborist's internal open/edit state).
    if (!initialLoadDone.current) {
      setLoading(true);
    }
    setError(null);
    try {
      const nodes = await loadDirectory('');
      setRootNodes(nodes);
      // Preserve previously loaded subtree paths so open folders stay
      // populated after a refresh instead of collapsing to empty children.
      setLoadedPaths((prev) => {
        const next = new Set(prev);
        next.add('');
        return next;
      });
      setLastSyncedAt(Date.now());

      // Re-load any previously expanded subtrees so their children are
      // still present in the new tree data.
      const prevLoaded = loadedPathsRef.current;
      for (const p of prevLoaded) {
        if (p === '') continue;
        try {
          const children = await loadDirectory(p);
          setRootNodes((prev) =>
            updateNodeInTree(prev, p, (node) => ({ ...node, children })),
          );
        } catch {
          // Subtree may have been deleted — drop it from loaded set.
          setLoadedPaths((prev) => {
            const next = new Set(prev);
            next.delete(p);
            return next;
          });
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [loadDirectory, activeRoot]);

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

  // When true, WebSocket-triggered refreshes are deferred until the flag
  // is cleared.  This prevents tree data updates while the user is
  // editing a node name inline (which would reset the input).
  const suppressWsRefreshRef = useRef(false);

  const flushPending = useCallback(() => {
    flushFrameRef.current = null;
    if (suppressWsRefreshRef.current) {
      // Re-schedule so pending paths are flushed once editing ends.
      flushFrameRef.current = requestAnimationFrame(flushPending);
      return;
    }
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

  // Reset initial load flag when project root changes so the new project
  // shows a loading spinner on its first load.
  const prevActiveRoot = useRef(activeRoot);
  useEffect(() => {
    if (prevActiveRoot.current !== activeRoot) {
      initialLoadDone.current = false;
      prevActiveRoot.current = activeRoot;
    }
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

  return { rootNodes, loading, error, refreshRoot, loadSubtree, lastSyncedAt, suppressWsRefreshRef };
}
