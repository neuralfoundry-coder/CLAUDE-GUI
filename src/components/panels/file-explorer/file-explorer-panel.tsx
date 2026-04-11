'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, FilePlus, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileTree } from './file-tree';
import { useFileTree } from './use-file-tree';
import { filesApi } from '@/lib/api-client';

function formatRelative(ts: number | null, now: number): string {
  if (ts === null) return 'never';
  const delta = Math.max(0, Math.floor((now - ts) / 1000));
  if (delta < 2) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3600)}h ago`;
}

export function FileExplorerPanel() {
  const { rootNodes, loading, error, refreshRoot, loadSubtree, lastSyncedAt } = useFileTree();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const onNewFile = async () => {
    const name = prompt('New file name');
    if (!name) return;
    try {
      await filesApi.write(name, '');
    } catch (err) {
      alert(`Create failed: ${(err as Error).message}`);
    }
  };

  const onNewFolder = async () => {
    const name = prompt('New folder name');
    if (!name) return;
    try {
      await filesApi.mkdir(name);
    } catch (err) {
      alert(`Create failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="flex h-full flex-col border-r bg-background">
      <div className="flex items-center justify-between border-b px-2 py-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Explorer</span>
          <span
            className="text-[10px] text-muted-foreground"
            title={lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'not synced yet'}
          >
            {formatRelative(lastSyncedAt, now)}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onNewFile}
            title="New file"
            aria-label="New file"
          >
            <FilePlus className="h-3 w-3" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onNewFolder}
            title="New folder"
            aria-label="New folder"
          >
            <FolderPlus className="h-3 w-3" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => void refreshRoot()}
            title="Refresh"
            aria-label="Refresh file tree"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <FileTree
        rootNodes={rootNodes}
        loading={loading}
        error={error}
        loadSubtree={loadSubtree}
      />
    </div>
  );
}
