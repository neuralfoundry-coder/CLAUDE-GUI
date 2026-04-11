'use client';

import { RefreshCw, FilePlus, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileTree } from './file-tree';
import { filesApi } from '@/lib/api-client';

export function FileExplorerPanel() {
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
        <span className="text-xs font-semibold uppercase text-muted-foreground">Explorer</span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onNewFile} title="New file">
            <FilePlus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onNewFolder}
            title="New folder"
          >
            <FolderPlus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => location.reload()}
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <FileTree />
    </div>
  );
}
