'use client';

import { Tree, type NodeRendererProps } from 'react-arborist';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { FileIcon } from './file-icon';
import { GitStatusIndicator } from './git-status-indicator';
import type { TreeNode } from './use-file-tree';
import { filesApi, terminalApi } from '@/lib/api-client';
import { useEditorStore } from '@/stores/use-editor-store';
import { usePreviewStore, detectPreviewType } from '@/stores/use-preview-store';
import { useTerminalStore } from '@/stores/use-terminal-store';
import { useLayoutStore } from '@/stores/use-layout-store';
import { useProjectStore } from '@/stores/use-project-store';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface NodeProps extends NodeRendererProps<TreeNode> {
  onOpenDir: (path: string) => void;
}

function Node({ node, style, dragHandle, onOpenDir }: NodeProps) {
  const openFile = useEditorStore((s) => s.openFile);
  const setPreviewFile = usePreviewStore((s) => s.setFile);
  const createTerminal = useTerminalStore((s) => s.createSession);
  const terminalCollapsed = useLayoutStore((s) => s.terminalCollapsed);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const activeRoot = useProjectStore((s) => s.activeRoot);
  const openProject = useProjectStore((s) => s.openProject);

  const onClick = () => {
    if (node.data.isDirectory) {
      if (!node.isOpen) onOpenDir(node.data.path);
      node.toggle();
    } else {
      openFile(node.data.path);
      if (detectPreviewType(node.data.path) !== 'none') {
        setPreviewFile(node.data.path);
      }
    }
  };

  const onDelete = async () => {
    if (!confirm(`Delete ${node.data.path}?`)) return;
    try {
      await filesApi.delete(node.data.path);
    } catch (err) {
      alert(`Delete failed: ${(err as Error).message}`);
    }
  };

  const onRename = async () => {
    const newName = prompt('New name', node.data.name);
    if (!newName || newName === node.data.name) return;
    const parent = node.data.path.split('/').slice(0, -1).join('/');
    const newPath = parent ? `${parent}/${newName}` : newName;
    try {
      await filesApi.rename(node.data.path, newPath);
    } catch (err) {
      alert(`Rename failed: ${(err as Error).message}`);
    }
  };

  const onOpenTerminalHere = () => {
    // For files, spawn in the parent directory. For dirs, spawn in the dir.
    const target = node.data.isDirectory
      ? node.data.path
      : node.data.path.split('/').slice(0, -1).join('/');
    if (terminalCollapsed) togglePanel('terminal');
    createTerminal({ initialCwd: target || '.' });
  };

  const onRevealInFinder = async () => {
    try {
      await filesApi.reveal(node.data.path);
    } catch (err) {
      alert(`Reveal failed: ${(err as Error).message}`);
    }
  };

  const onOpenInSystemTerminal = async () => {
    const target = node.data.isDirectory
      ? node.data.path
      : node.data.path.split('/').slice(0, -1).join('/');
    try {
      await terminalApi.openNative(target || undefined);
    } catch (err) {
      alert(`Could not open system terminal: ${(err as Error).message}`);
    }
  };

  const onOpenAsProjectRoot = async () => {
    if (!activeRoot || !node.data.isDirectory) return;
    const sep = activeRoot.includes('\\') && !activeRoot.includes('/') ? '\\' : '/';
    const abs = `${activeRoot.replace(/[/\\]+$/, '')}${sep}${node.data.path}`;
    try {
      await openProject(abs);
    } catch (err) {
      alert(`Open as project root failed: ${(err as Error).message}`);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={dragHandle}
          style={style}
          className={cn(
            'group flex cursor-pointer items-center gap-1 px-2 text-sm hover:bg-accent',
            node.isSelected && 'bg-accent',
          )}
          onClick={onClick}
        >
          {node.data.isDirectory ? (
            node.isOpen ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )
          ) : (
            <span className="w-3" />
          )}
          <FileIcon
            name={node.data.name}
            isDirectory={node.data.isDirectory}
            isOpen={node.isOpen}
            className="h-4 w-4 shrink-0"
          />
          <span className="flex-1 truncate">{node.data.name}</span>
          <GitStatusIndicator path={node.data.path} />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {node.data.isDirectory && (
          <>
            <ContextMenuItem onSelect={onOpenAsProjectRoot}>
              Open as project root
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={onOpenTerminalHere}>Open terminal here</ContextMenuItem>
        <ContextMenuItem onSelect={onOpenInSystemTerminal}>
          Open in system terminal
        </ContextMenuItem>
        <ContextMenuItem onSelect={onRevealInFinder}>
          Reveal in {navigator.userAgent.includes('Mac') ? 'Finder' : 'File Explorer'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>
        <ContextMenuItem onSelect={() => navigator.clipboard?.writeText(node.data.path)}>
          Copy path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onDelete} className="text-destructive">
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface FileTreeProps {
  rootNodes: TreeNode[];
  loading: boolean;
  error: string | null;
  loadSubtree: (path: string) => void | Promise<void>;
}

export function FileTree({ rootNodes, loading, error, loadSubtree }: FileTreeProps) {
  if (loading) return <div className="p-3 text-xs text-muted-foreground">Loading…</div>;
  if (error) return <div className="p-3 text-xs text-destructive">{error}</div>;

  return (
    <div className="flex-1 overflow-hidden">
      <Tree<TreeNode>
        data={rootNodes}
        openByDefault={false}
        width="100%"
        height={800}
        indent={16}
        rowHeight={24}
      >
        {(props) => <Node {...props} onOpenDir={loadSubtree} />}
      </Tree>
    </div>
  );
}
