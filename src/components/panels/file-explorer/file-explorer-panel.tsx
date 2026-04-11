'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, FilePlus, FolderPlus, ArrowUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileTree } from './file-tree';
import { useFileTree } from './use-file-tree';
import { filesApi } from '@/lib/api-client';
import { useProjectStore } from '@/stores/use-project-store';
import { cn } from '@/lib/utils';

function collectFilesFromDataTransfer(dt: DataTransfer): File[] {
  const files: File[] = [];
  if (dt.items && dt.items.length > 0) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) return files;
  }
  if (dt.files && dt.files.length > 0) {
    return Array.from(dt.files);
  }
  return files;
}

function hasFilePayload(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  const types = dt.types;
  if (!types) return false;
  for (let i = 0; i < types.length; i += 1) {
    if (types[i] === 'Files') return true;
  }
  return false;
}

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
  const [dragDepth, setDragDepth] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const activeRoot = useProjectStore((s) => s.activeRoot);
  const openProject = useProjectStore((s) => s.openProject);
  const openParent = useProjectStore((s) => s.openParent);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const uploadFiles = useCallback(
    async (destDir: string, files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      setUploadError(null);
      try {
        await filesApi.upload(destDir, files);
        // WS watcher will also fire, but a manual refresh keeps the tree
        // immediately responsive without waiting for chokidar debouncing.
        await refreshRoot();
      } catch (err) {
        setUploadError((err as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [refreshRoot],
  );

  const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(e.dataTransfer)) return;
    e.preventDefault();
    setDragDepth((d) => d + 1);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(e.dataTransfer)) return;
    setDragDepth((d) => Math.max(0, d - 1));
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!hasFilePayload(e.dataTransfer)) return;
      e.preventDefault();
      setDragDepth(0);
      const files = collectFilesFromDataTransfer(e.dataTransfer);
      if (files.length === 0) return;
      void uploadFiles('', files);
    },
    [uploadFiles],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;
      e.preventDefault();
      void uploadFiles('', Array.from(files));
    },
    [uploadFiles],
  );

  const breadcrumb = useMemo(() => buildBreadcrumb(activeRoot), [activeRoot]);
  const canGoUp = breadcrumb.length > 1;

  const onGoUp = async () => {
    try {
      await openParent();
    } catch (err) {
      alert(`Cannot move up: ${(err as Error).message}`);
    }
  };

  const onNavigateSegment = async (targetAbs: string) => {
    if (targetAbs === activeRoot) return;
    try {
      await openProject(targetAbs);
    } catch (err) {
      alert(`Navigate failed: ${(err as Error).message}`);
    }
  };

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

  const isDragOver = dragDepth > 0;
  const statusText = uploading
    ? 'uploading…'
    : uploadError
      ? `upload failed: ${uploadError}`
      : formatRelative(lastSyncedAt, now);

  return (
    <div
      tabIndex={0}
      className={cn(
        'relative flex h-full flex-col border-r bg-background outline-none',
        isDragOver && 'ring-2 ring-inset ring-primary',
      )}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPaste={onPaste}
      aria-label="File explorer"
    >
      <div className="flex items-center justify-between border-b px-2 py-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Explorer</span>
          <span
            className={cn(
              'text-[10px] text-muted-foreground',
              uploadError && 'text-destructive',
            )}
            title={lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'not synced yet'}
          >
            {statusText}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => void onGoUp()}
            disabled={!canGoUp}
            title="Move project root to parent directory"
            aria-label="Move project root up"
          >
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
          </Button>
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
      {activeRoot ? (
        <div
          className="flex items-center gap-0.5 overflow-x-auto border-b px-2 py-1 text-[11px] font-mono text-muted-foreground"
          aria-label="Project root breadcrumb"
        >
          {breadcrumb.map((seg, i) => (
            <span key={seg.abs} className="flex shrink-0 items-center gap-0.5">
              {i > 0 && <span className="select-none text-muted-foreground/60">/</span>}
              <button
                type="button"
                onClick={() => void onNavigateSegment(seg.abs)}
                className={
                  seg.abs === activeRoot
                    ? 'cursor-default font-semibold text-foreground'
                    : 'rounded px-1 hover:bg-accent hover:text-foreground'
                }
                aria-current={seg.abs === activeRoot ? 'location' : undefined}
                title={seg.abs}
              >
                {seg.label}
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="border-b px-2 py-1 text-[11px] text-muted-foreground">(no project open)</div>
      )}
      <FileTree
        rootNodes={rootNodes}
        loading={loading}
        error={error}
        loadSubtree={loadSubtree}
      />
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/10">
          <div className="flex items-center gap-2 rounded-md border border-primary bg-background px-3 py-2 text-xs text-primary shadow-md">
            <Upload className="h-4 w-4" aria-hidden="true" />
            Drop files to upload to project root
          </div>
        </div>
      )}
    </div>
  );
}

interface BreadcrumbSegment {
  label: string;
  abs: string;
}

function buildBreadcrumb(root: string | null): BreadcrumbSegment[] {
  if (!root) return [];
  const winDrive = /^[A-Za-z]:[/\\]/.test(root);
  const sep = root.includes('\\') ? '\\' : '/';
  if (winDrive) {
    const driveRoot = root.slice(0, 3);
    const rest = root.slice(3).split(/[\\/]+/).filter(Boolean);
    const segs: BreadcrumbSegment[] = [{ label: driveRoot, abs: driveRoot }];
    let cursor = driveRoot;
    for (const part of rest) {
      cursor = cursor.endsWith(sep) ? cursor + part : cursor + sep + part;
      segs.push({ label: part, abs: cursor });
    }
    return segs;
  }
  const parts = root.split('/').filter(Boolean);
  const segs: BreadcrumbSegment[] = [{ label: '/', abs: '/' }];
  let cursor = '';
  for (const part of parts) {
    cursor = `${cursor}/${part}`;
    segs.push({ label: part, abs: cursor });
  }
  return segs;
}
