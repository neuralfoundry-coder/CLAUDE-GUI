'use client';

import { useEffect, useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu';
import { useFileContextMenuStore } from '@/stores/use-file-context-menu-store';
import { useFileClipboardStore } from '@/stores/use-file-clipboard-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { gitApi, filesApi } from '@/lib/api-client';
import type { FileActions } from './use-file-actions';

const isMac =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
const cmdKey = isMac ? '⌘' : 'Ctrl';
const revealLabel = isMac ? 'Reveal in Finder' : 'Reveal in File Explorer';

interface FileContextMenuProps {
  actions: FileActions;
  onRequestRename: (id: string) => void;
  onRequestCreateFile: (parentPath: string) => void;
  onRequestCreateFolder: (parentPath: string) => void;
  onRequestRefresh: () => void;
}

export function FileContextMenu({
  actions,
  onRequestRename,
  onRequestCreateFile,
  onRequestCreateFolder,
  onRequestRefresh,
}: FileContextMenuProps) {
  const open = useFileContextMenuStore((s) => s.open);
  const scope = useFileContextMenuStore((s) => s.scope);
  const target = useFileContextMenuStore((s) => s.target);
  const anchorX = useFileContextMenuStore((s) => s.anchorX);
  const anchorY = useFileContextMenuStore((s) => s.anchorY);
  const selectionPaths = useFileContextMenuStore((s) => s.selectionPaths);
  const close = useFileContextMenuStore((s) => s.close);

  const clipboardMode = useFileClipboardStore((s) => s.mode);
  const clipboardPaths = useFileClipboardStore((s) => s.paths);
  const hasClipboard = clipboardMode !== null && clipboardPaths.length > 0;

  // Reposition the invisible trigger before Radix opens the floating menu so
  // it anchors at the click coordinates rather than the (0,0) of the panel.
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (triggerRef.current) {
      triggerRef.current.style.left = `${anchorX}px`;
      triggerRef.current.style.top = `${anchorY}px`;
    }
  }, [anchorX, anchorY, open]);

  const selection = selectionPaths.length > 0 ? selectionPaths : target ? [target.path] : [];
  const targetIsDir = target?.isDirectory ?? false;

  const wrap = (fn: () => unknown) => () => {
    close();
    void Promise.resolve()
      .then(() => fn())
      .catch((err) => {
        console.error('[file-context-menu] action failed', err);
        if (typeof window !== 'undefined') {
          window.alert(`Action failed: ${(err as Error).message}`);
        }
      });
  };

  // Where "new file/folder/paste" lands when triggered from the menu:
  // - Node menu on a directory  → inside that directory
  // - Node menu on a file       → next to the file (its parent dir)
  // - Empty area                → project root
  const containerPath = (() => {
    if (scope === 'empty' || !target) return '';
    if (target.isDirectory) return target.path;
    const parts = target.path.split('/').filter(Boolean);
    parts.pop();
    return parts.join('/');
  })();

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: 'fixed',
            left: anchorX,
            top: anchorY,
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={2} className="min-w-[14rem]">
        {scope === 'node' && target ? (
          <>
            {!targetIsDir && (
              <DropdownMenuItem onSelect={wrap(() => actions.openFile(target.path))}>
                Open
              </DropdownMenuItem>
            )}
            {targetIsDir && (
              <DropdownMenuItem onSelect={wrap(() => actions.openAsProjectRoot(target))}>
                Open as project root
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={wrap(() => actions.openTerminalHere(target))}>
              Open terminal here
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={wrap(() => actions.openInSystemTerminal(target))}>
              Open in system terminal
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={wrap(() => actions.revealInOS(target.path))}>
              {revealLabel}
            </DropdownMenuItem>
            {!targetIsDir && (
              <DropdownMenuItem
                onSelect={wrap(async () => {
                  const { original } = await gitApi.diff(target.path);
                  const { content } = await filesApi.read(target.path);
                  if (original === content) return; // no changes
                  await useEditorStore.getState().openFile(target.path);
                  // Show diff: original (HEAD) vs current working copy
                  useEditorStore.getState().applyClaudeEdit(target.path, content);
                  // Override the diff's original to the git HEAD version
                  useEditorStore.setState((s) => ({
                    tabs: s.tabs.map((t) =>
                      t.path === target.path && t.diff
                        ? { ...t, diff: { ...t.diff, original } }
                        : t,
                    ),
                  }));
                })}
              >
                View Git Diff
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={wrap(() => actions.cutToClipboard(selection))}>
              Cut
              <DropdownMenuShortcut>{cmdKey}+X</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={wrap(() => actions.copyToClipboard(selection))}>
              Copy
              <DropdownMenuShortcut>{cmdKey}+C</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!hasClipboard}
              onSelect={wrap(() => actions.paste(containerPath))}
            >
              Paste
              <DropdownMenuShortcut>{cmdKey}+V</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={wrap(() => actions.duplicate(target.path))}>
              Duplicate
              <DropdownMenuShortcut>{cmdKey}+D</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={wrap(() => actions.copyPathToClipboard(target.path))}>
              Copy path
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {targetIsDir && (
              <>
                <DropdownMenuItem onSelect={wrap(() => onRequestCreateFile(containerPath))}>
                  New file…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={wrap(() => onRequestCreateFolder(containerPath))}>
                  New folder…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={wrap(() => onRequestRename(target.id))}>
              Rename
              <DropdownMenuShortcut>F2</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={wrap(() => actions.deletePaths(selection))}
            >
              Delete
              <DropdownMenuShortcut>Del</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={wrap(() => onRequestCreateFile(''))}>
              New file…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={wrap(() => onRequestCreateFolder(''))}>
              New folder…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!hasClipboard}
              onSelect={wrap(() => actions.paste(''))}
            >
              Paste
              <DropdownMenuShortcut>{cmdKey}+V</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={wrap(() => onRequestRefresh())}>
              Refresh
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
