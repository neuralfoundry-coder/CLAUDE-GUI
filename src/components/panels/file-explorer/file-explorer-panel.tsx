'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshCw, FilePlus, FolderPlus, ArrowUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RelativeTime } from '@/components/ui/relative-time';
import { FileTree, type FileTreeHandle } from './file-tree';
import { useFileTree } from './use-file-tree';
import { useFileActions } from './use-file-actions';
import { useFileKeyboard } from './use-file-keyboard';
import { FileContextMenu } from './file-context-menu';
import { DeleteConfirmDialog } from './delete-confirm-dialog';
import { filesApi } from '@/lib/api-client';
import { useProjectStore } from '@/stores/use-project-store';
import { useLayoutStore } from '@/stores/use-layout-store';
import { useFileContextMenuStore } from '@/stores/use-file-context-menu-store';
import { usePanelFocus } from '@/hooks/use-panel-focus';
import { PanelZoomControls } from '@/components/panels/panel-zoom-controls';
import { cn } from '@/lib/utils';
import { collectFilesFromDataTransfer, hasFilePayload } from '@/lib/fs/collect-files';

interface FileExplorerPanelProps {
  leafId?: string;
}

export function FileExplorerPanel({ leafId: _leafId }: FileExplorerPanelProps) {
  const { rootNodes, loading, error, refreshRoot, loadSubtree, lastSyncedAt, suppressWsRefreshRef } = useFileTree();
  const [dragDepth, setDragDepth] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const treeRef = useRef<FileTreeHandle>(null);
  const selectionRef = useRef<string[]>([]);
  selectionRef.current = selection;
  const activeRoot = useProjectStore((s) => s.activeRoot);
  const openProject = useProjectStore((s) => s.openProject);
  const openParent = useProjectStore((s) => s.openParent);
  const openContextMenuAtEmpty = useFileContextMenuStore((s) => s.openAtEmpty);
  const actions = useFileActions(refreshRoot);
  const panelFocus = usePanelFocus('fileExplorer');
  const explorerZoom = useLayoutStore((s) => s.panelZoom.fileExplorer);

  const uploadFiles = useCallback(
    async (destDir: string, files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      setUploadError(null);
      try {
        await filesApi.upload(destDir, files);
        // WS watcher will also fire, but a manual refresh keeps the tree
        // immediately responsive without waiting on the watcher event batch.
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

  const generateUniqueName = useCallback(
    async (parentPath: string, baseName: string): Promise<string> => {
      try {
        const list = await filesApi.list(parentPath);
        const existing = new Set(list.entries.map((e) => e.name));
        if (!existing.has(baseName)) return baseName;
        const dot = baseName.lastIndexOf('.');
        const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
        const ext = dot > 0 ? baseName.slice(dot) : '';
        for (let i = 2; i < 1000; i++) {
          const candidate = `${stem} ${i}${ext}`;
          if (!existing.has(candidate)) return candidate;
        }
      } catch {
        /* ignore — fall through to base name */
      }
      return baseName;
    },
    [],
  );

  // After creating a file/folder and refreshing the tree, the node may not
  // be ready for editing immediately (react-arborist needs a render cycle).
  // Retry until the tree confirms it entered edit mode, then stop —
  // calling edit() on an already-editing node cancels and restarts it,
  // which resets the input and loses the user's keystrokes.
  const beginRenameWithRetry = useCallback((targetPath: string) => {
    // Suppress WebSocket-driven tree refreshes while we try to enter
    // edit mode and while the user is typing — data updates would reset
    // the inline input.
    suppressWsRefreshRef.current = true;
    let attempts = 0;
    const maxAttempts = 10;
    const tryRename = () => {
      attempts++;
      const handle = treeRef.current;
      if (!handle) {
        if (attempts < maxAttempts) requestAnimationFrame(tryRename);
        return;
      }
      // Already in edit mode — stop retrying (calling edit() again
      // would cancel the current edit and reset the input).
      if (handle.isEditing()) return;
      handle.beginRename(targetPath);
      if (attempts < maxAttempts) requestAnimationFrame(tryRename);
    };
    requestAnimationFrame(tryRename);
  }, [suppressWsRefreshRef]);

  const onNewFile = useCallback(
    async (parentPath: string = '') => {
      try {
        const name = await generateUniqueName(parentPath, 'untitled.txt');
        const targetPath = parentPath ? `${parentPath}/${name}` : name;
        await filesApi.write(targetPath, '');
        await refreshRoot();
        beginRenameWithRetry(targetPath);
      } catch (err) {
        alert(`Create failed: ${(err as Error).message}`);
      }
    },
    [generateUniqueName, refreshRoot, beginRenameWithRetry],
  );

  const onNewFolder = useCallback(
    async (parentPath: string = '') => {
      try {
        const name = await generateUniqueName(parentPath, 'untitled folder');
        const targetPath = parentPath ? `${parentPath}/${name}` : name;
        await filesApi.mkdir(targetPath);
        await refreshRoot();
        beginRenameWithRetry(targetPath);
      } catch (err) {
        alert(`Create failed: ${(err as Error).message}`);
      }
    },
    [generateUniqueName, refreshRoot, beginRenameWithRetry],
  );

  const onTreeContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only fire when the user right-clicked the empty area of the tree;
      // node-level handlers stop propagation in file-tree.tsx.
      e.preventDefault();
      openContextMenuAtEmpty({ clientX: e.clientX, clientY: e.clientY });
    },
    [openContextMenuAtEmpty],
  );

  const onMove = useCallback(
    async (args: {
      dragIds: string[];
      parentId: string | null;
      index: number;
      altKey: boolean;
    }) => {
      const { dragIds, parentId, altKey } = args;
      const destDir = parentId ?? '';
      const failed: Array<{ src: string; error: string }> = [];
      for (const src of dragIds) {
        const name = src.split('/').filter(Boolean).pop() ?? src;
        const dest = destDir ? `${destDir}/${name}` : name;
        if (src === dest) continue;
        // Block moves into self/descendant.
        if (
          !altKey &&
          (destDir === src || destDir.startsWith(src.endsWith('/') ? src : src + '/'))
        ) {
          failed.push({ src, error: 'Cannot move into itself' });
          continue;
        }
        try {
          if (altKey) {
            await filesApi.copy(src, dest);
          } else {
            await filesApi.rename(src, dest);
          }
        } catch (err) {
          failed.push({ src, error: (err as Error).message });
        }
      }
      await refreshRoot();
      if (failed.length > 0) {
        alert(
          `${failed.length} item(s) failed:\n` +
            failed.map((f) => `${f.src}: ${f.error}`).join('\n'),
        );
      }
    },
    [refreshRoot],
  );

  const onRenameInline = useCallback(
    async ({ id, name }: { id: string; name: string }) => {
      // Editing is finished — resume WebSocket-driven refreshes.
      suppressWsRefreshRef.current = false;
      const trimmed = name.trim();
      if (!trimmed || trimmed === '.' || trimmed === '..' || /[\\/\0]/.test(trimmed)) {
        alert('Invalid name');
        return;
      }
      const parent = id.split('/').slice(0, -1).join('/');
      const newPath = parent ? `${parent}/${trimmed}` : trimmed;
      if (newPath === id) return;
      try {
        await filesApi.rename(id, newPath);
        await refreshRoot();
      } catch (err) {
        alert(`Rename failed: ${(err as Error).message}`);
      }
    },
    [refreshRoot, suppressWsRefreshRef],
  );

  useFileKeyboard({
    treeRef,
    actions,
    selectionRef,
    onNewFile,
    onNewFolder,
    onRename: beginRenameWithRetry,
  });

  const isDragOver = dragDepth > 0;

  return (
    <div
      tabIndex={0}
      data-file-explorer-panel="true"
      data-panel-id="fileExplorer"
      className={cn(
        'relative flex h-full flex-col panel-container panel-container-restore-border-r bg-background outline-none',
        isDragOver && 'ring-2 ring-inset ring-primary',
      )}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPaste={onPaste}
      onMouseDown={panelFocus.onMouseDown}
      onFocus={panelFocus.onFocus}
      aria-label="File explorer"
    >
      <div className="flex items-center justify-between border-b glass-surface glass-highlight relative px-2 py-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Explorer</span>
          <PanelZoomControls panelId="fileExplorer" />
          <span
            className={cn(
              'text-[10px] text-muted-foreground',
              uploadError && 'text-destructive',
            )}
            title={lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'not synced yet'}
          >
            {uploading ? 'uploading…' : uploadError ? `upload failed: ${uploadError}` : <RelativeTime timestamp={lastSyncedAt} />}
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
            onClick={() => void onNewFile('')}
            title="New file"
            aria-label="New file"
          >
            <FilePlus className="h-3 w-3" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => void onNewFolder('')}
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
      <div
        className="flex min-h-0 flex-1 flex-col"
        onContextMenu={onTreeContextMenu}
        style={explorerZoom !== 1 ? { zoom: explorerZoom } : undefined}
      >
        <FileTree
          ref={treeRef}
          rootNodes={rootNodes}
          loading={loading}
          error={error}
          loadSubtree={loadSubtree}
          onActivateFile={actions.openFile}
          onSelectionChange={setSelection}
          onMove={onMove}
          onRename={onRenameInline}
          onExternalFileDrop={uploadFiles}
        />
      </div>
      <FileContextMenu
        actions={actions}
        onRequestRename={(id) => beginRenameWithRetry(id)}
        onRequestCreateFile={(parentPath) => void onNewFile(parentPath)}
        onRequestCreateFolder={(parentPath) => void onNewFolder(parentPath)}
        onRequestRefresh={() => void refreshRoot()}
      />
      <DeleteConfirmDialog />
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
