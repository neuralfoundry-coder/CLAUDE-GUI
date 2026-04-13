'use client';

import { useMemo } from 'react';
import { useKeyboardShortcut, type Shortcut } from '@/hooks/use-keyboard-shortcut';
import type { FileTreeHandle } from './file-tree';
import type { FileActions } from './use-file-actions';

export function isFocusInsideFileExplorer(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!el) return false;
  // Don't intercept keystrokes while the user is typing in an inline
  // rename/create input — otherwise Backspace/Delete would trigger the
  // "delete selected items" shortcut instead of editing the text.
  const tag = (el as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return false;
  return Boolean((el as Element).closest?.('[data-file-explorer-panel="true"]'));
}

interface UseFileKeyboardOptions {
  treeRef: React.RefObject<FileTreeHandle | null>;
  actions: FileActions;
  selectionRef: React.RefObject<string[]>;
  onNewFile: (parentPath: string) => void | Promise<void>;
  onNewFolder: (parentPath: string) => void | Promise<void>;
}

export function useFileKeyboard({
  treeRef,
  actions,
  selectionRef,
  onNewFile,
  onNewFolder,
}: UseFileKeyboardOptions): void {
  const shortcuts = useMemo<Shortcut[]>(() => {
    const when = isFocusInsideFileExplorer;
    const getSelection = () => {
      const sel = selectionRef.current ?? [];
      if (sel.length > 0) return sel;
      return treeRef.current?.getSelectedIds() ?? [];
    };

    return [
      // F2 — rename current node
      {
        key: 'F2',
        when,
        handler: () => {
          const sel = getSelection();
          if (sel.length === 1 && sel[0]) treeRef.current?.beginRename(sel[0]);
        },
      },
      // Delete / Backspace — remove selection
      {
        key: 'Delete',
        when,
        handler: () => {
          const sel = getSelection();
          if (sel.length > 0) void actions.deletePaths(sel);
        },
      },
      {
        key: 'Backspace',
        when,
        handler: () => {
          const sel = getSelection();
          if (sel.length > 0) void actions.deletePaths(sel);
        },
      },
      // Cmd/Ctrl+A — select all visible
      {
        key: 'a',
        meta: true,
        when,
        handler: () => {
          treeRef.current?.selectAll();
        },
      },
      // Cmd/Ctrl+C — copy
      {
        key: 'c',
        meta: true,
        when,
        handler: () => {
          const sel = getSelection();
          if (sel.length > 0) actions.copyToClipboard(sel);
        },
      },
      // Cmd/Ctrl+X — cut
      {
        key: 'x',
        meta: true,
        when,
        handler: () => {
          const sel = getSelection();
          if (sel.length > 0) actions.cutToClipboard(sel);
        },
      },
      // Cmd/Ctrl+V — paste into the parent of the focused selection (or root)
      {
        key: 'v',
        meta: true,
        when,
        handler: () => {
          const sel = getSelection();
          let dest = '';
          if (sel.length === 1 && sel[0]) {
            const parts = sel[0].split('/').filter(Boolean);
            parts.pop();
            dest = parts.join('/');
          }
          void actions.paste(dest);
        },
      },
      // Cmd/Ctrl+D — duplicate first selected
      {
        key: 'd',
        meta: true,
        when,
        handler: () => {
          const sel = getSelection();
          if (sel.length === 1 && sel[0]) void actions.duplicate(sel[0]);
        },
      },
      // Cmd/Ctrl+N — new file
      {
        key: 'n',
        meta: true,
        when,
        handler: () => {
          const sel = getSelection();
          let parent = '';
          if (sel.length === 1 && sel[0]) {
            const parts = sel[0].split('/').filter(Boolean);
            parts.pop();
            parent = parts.join('/');
          }
          void onNewFile(parent);
        },
      },
      // Cmd/Ctrl+Shift+N — new folder
      {
        key: 'n',
        meta: true,
        shift: true,
        when,
        handler: () => {
          const sel = getSelection();
          let parent = '';
          if (sel.length === 1 && sel[0]) {
            const parts = sel[0].split('/').filter(Boolean);
            parts.pop();
            parent = parts.join('/');
          }
          void onNewFolder(parent);
        },
      },
      // Escape — clear selection
      {
        key: 'Escape',
        when,
        preventDefault: false,
        handler: () => {
          treeRef.current?.deselectAll();
        },
      },
    ];
  }, [actions, onNewFile, onNewFolder, selectionRef, treeRef]);

  useKeyboardShortcut(shortcuts);
}
