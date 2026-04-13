'use client';

import { useCallback } from 'react';
import { filesApi, terminalApi } from '@/lib/api-client';
import { useEditorStore } from '@/stores/use-editor-store';
import { usePreviewStore, detectPreviewType } from '@/stores/use-preview-store';
import { useTerminalStore } from '@/stores/use-terminal-store';
import { useSplitLayoutStore } from '@/stores/use-split-layout-store';
import { useProjectStore } from '@/stores/use-project-store';
import { useFileClipboardStore } from '@/stores/use-file-clipboard-store';
import { useDeleteConfirmStore } from './delete-confirm-dialog';
import type { TreeNode } from './use-file-tree';

function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p;
}

function dirname(p: string): string {
  const parts = p.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function isPathInside(parent: string, child: string): boolean {
  if (parent === child) return true;
  const sep = parent.endsWith('/') ? parent : parent + '/';
  return child.startsWith(sep);
}

export interface FileActions {
  openFile: (path: string) => void;
  openTerminalHere: (target: TreeNode | string) => void;
  openInSystemTerminal: (target: TreeNode | string) => Promise<void>;
  revealInOS: (path: string) => Promise<void>;
  copyPathToClipboard: (path: string) => Promise<void>;
  openAsProjectRoot: (target: TreeNode) => Promise<void>;
  copyToClipboard: (paths: string[]) => void;
  cutToClipboard: (paths: string[]) => void;
  paste: (destDir: string) => Promise<{ written: string[]; failed: Array<{ path: string; error: string }> }>;
  duplicate: (path: string) => Promise<void>;
  deletePaths: (paths: string[], options?: { recursive?: boolean; skipConfirm?: boolean }) => Promise<{ ok: number; failed: Array<{ path: string; error: string }> }>;
}

export function useFileActions(refreshRoot: () => Promise<void> | void): FileActions {
  const openFileInEditor = useEditorStore((s) => s.openFile);
  const setPreviewFile = usePreviewStore((s) => s.setFile);
  const createTerminal = useTerminalStore((s) => s.createSession);
  const isPanelCollapsed = useSplitLayoutStore((s) => s.isPanelCollapsed);
  const togglePanel = useSplitLayoutStore((s) => s.togglePanelByType);
  const activeRoot = useProjectStore((s) => s.activeRoot);
  const openProject = useProjectStore((s) => s.openProject);
  const setClipboard = useFileClipboardStore((s) => s.setClipboard);
  const clearClipboard = useFileClipboardStore((s) => s.clear);

  const openFile = useCallback(
    (path: string) => {
      openFileInEditor(path);
      if (detectPreviewType(path) !== 'none') setPreviewFile(path);
    },
    [openFileInEditor, setPreviewFile],
  );

  const openTerminalHere = useCallback(
    (target: TreeNode | string) => {
      const path = typeof target === 'string' ? target : target.path;
      const isDir = typeof target === 'string' ? true : target.isDirectory;
      const cwd = isDir ? path : dirname(path);
      if (isPanelCollapsed('terminal')) togglePanel('terminal');
      createTerminal({ initialCwd: cwd || '.' });
    },
    [createTerminal, isPanelCollapsed, togglePanel],
  );

  const openInSystemTerminal = useCallback(
    async (target: TreeNode | string) => {
      const path = typeof target === 'string' ? target : target.path;
      const isDir = typeof target === 'string' ? true : target.isDirectory;
      const cwd = isDir ? path : dirname(path);
      const notify = useTerminalStore.getState().setNativeTerminalNotice;
      try {
        const result = await terminalApi.openNative(cwd || undefined);
        notify({ type: 'success', message: `Opened in ${result.launcher}`, ts: Date.now() });
      } catch (err) {
        notify({ type: 'error', message: `Could not open system terminal: ${(err as Error).message}`, ts: Date.now() });
      }
    },
    [],
  );

  const revealInOS = useCallback(async (path: string) => {
    await filesApi.reveal(path);
  }, []);

  const copyPathToClipboard = useCallback(async (path: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(path);
  }, []);

  const openAsProjectRoot = useCallback(
    async (target: TreeNode) => {
      if (!activeRoot || !target.isDirectory) return;
      const sep = activeRoot.includes('\\') && !activeRoot.includes('/') ? '\\' : '/';
      const abs = `${activeRoot.replace(/[/\\]+$/, '')}${sep}${target.path}`;
      await openProject(abs);
    },
    [activeRoot, openProject],
  );

  const copyToClipboard = useCallback(
    (paths: string[]) => {
      setClipboard('copy', paths);
    },
    [setClipboard],
  );

  const cutToClipboard = useCallback(
    (paths: string[]) => {
      setClipboard('cut', paths);
    },
    [setClipboard],
  );

  const paste = useCallback(
    async (destDir: string) => {
      const { mode, paths } = useFileClipboardStore.getState();
      const written: string[] = [];
      const failed: Array<{ path: string; error: string }> = [];
      if (!mode || paths.length === 0) return { written, failed };

      for (const src of paths) {
        if (mode === 'cut' && isPathInside(src, destDir)) {
          failed.push({ path: src, error: 'Cannot move into itself' });
          continue;
        }
        const name = basename(src);
        const dest = joinPath(destDir, name);
        try {
          if (mode === 'copy') {
            const res = await filesApi.copy(src, dest);
            written.push(res.writtenPath);
          } else {
            await filesApi.rename(src, dest);
            written.push(dest);
          }
        } catch (err) {
          failed.push({ path: src, error: (err as Error).message });
        }
      }
      if (mode === 'cut' && failed.length === 0) {
        clearClipboard();
      }
      await refreshRoot();
      return { written, failed };
    },
    [clearClipboard, refreshRoot],
  );

  const duplicate = useCallback(
    async (path: string) => {
      try {
        await filesApi.copy(path, path);
        await refreshRoot();
      } catch (err) {
        console.error('[file-actions] duplicate failed', err);
        throw err;
      }
    },
    [refreshRoot],
  );

  const requestDeleteConfirm = useDeleteConfirmStore((s) => s.request);

  const deletePaths = useCallback(
    async (
      paths: string[],
      options: { recursive?: boolean; skipConfirm?: boolean } = {},
    ) => {
      const { recursive = true, skipConfirm = false } = options;
      if (paths.length === 0) return { ok: 0, failed: [] };
      if (!skipConfirm) {
        const ok = await requestDeleteConfirm(paths);
        if (!ok) return { ok: 0, failed: [] };
      }
      let ok = 0;
      const failed: Array<{ path: string; error: string }> = [];
      for (const p of paths) {
        try {
          await filesApi.delete(p, { recursive });
          ok++;
        } catch (err) {
          failed.push({ path: p, error: (err as Error).message });
        }
      }
      await refreshRoot();
      if (failed.length > 0 && typeof window !== 'undefined') {
        window.alert(
          `${failed.length} item(s) could not be deleted:\n` +
            failed.map((f) => `${f.path}: ${f.error}`).join('\n'),
        );
      }
      return { ok, failed };
    },
    [refreshRoot, requestDeleteConfirm],
  );

  return {
    openFile,
    openTerminalHere,
    openInSystemTerminal,
    revealInOS,
    copyPathToClipboard,
    openAsProjectRoot,
    copyToClipboard,
    cutToClipboard,
    paste,
    duplicate,
    deletePaths,
  };
}
