'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  Tree,
  type NodeApi,
  type NodeRendererProps,
  type TreeApi,
} from 'react-arborist';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { FileIcon } from './file-icon';
import { GitStatusIndicator } from './git-status-indicator';
import type { TreeNode } from './use-file-tree';
import { useFileContextMenuStore } from '@/stores/use-file-context-menu-store';
import { useFileClipboardStore } from '@/stores/use-file-clipboard-store';
import { cn } from '@/lib/utils';

interface NodeProps extends NodeRendererProps<TreeNode> {
  onOpenDir: (path: string) => void;
  onActivateFile: (path: string) => void;
}

function Node({ node, style, dragHandle, onOpenDir, onActivateFile }: NodeProps) {
  const openContextMenuAtNode = useFileContextMenuStore((s) => s.openAtNode);
  const isCut = useFileClipboardStore((s) => s.isCut(node.data.path));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (node.isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [node.isEditing]);

  const onClick = (e: React.MouseEvent) => {
    if (node.isEditing) return;
    // Let react-arborist handle multi-select / focus first.
    node.handleClick(e);
    if (node.data.isDirectory) {
      if (!node.isOpen) onOpenDir(node.data.path);
      node.toggle();
    } else {
      onActivateFile(node.data.path);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Right-click should also focus/select the node so the menu acts on the
    // expected target — match Finder/Explorer behaviour. If the node was
    // already part of a multi-selection, preserve it.
    if (!node.isSelected) {
      node.select();
    }
    const selected = Array.from(node.tree.selectedIds);
    const selectionPaths = selected.length > 0 ? selected : [node.data.path];
    openContextMenuAtNode(
      { clientX: e.clientX, clientY: e.clientY },
      node.data,
      selectionPaths,
    );
  };

  return (
    <div
      ref={dragHandle}
      style={style}
      className={cn(
        'group flex cursor-pointer items-center gap-1 px-2 text-sm hover:bg-accent',
        node.isSelected && 'bg-accent',
        isCut && 'italic opacity-50',
      )}
      onClick={onClick}
      onContextMenu={onContextMenu}
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
      {node.isEditing ? (
        <input
          ref={inputRef}
          defaultValue={node.data.name}
          className="flex-1 rounded-sm border border-primary bg-background px-1 text-sm outline-none"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              node.submit(e.currentTarget.value);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              node.reset();
            }
          }}
          onBlur={(e) => node.submit(e.currentTarget.value)}
        />
      ) : (
        <span className="flex-1 truncate">{node.data.name}</span>
      )}
      <GitStatusIndicator path={node.data.path} />
    </div>
  );
}

export interface FileTreeHandle {
  beginRename: (id: string) => void;
  beginCreate: (opts: { type: 'leaf' | 'internal'; parentId: string | null }) => void;
  selectAll: () => void;
  deselectAll: () => void;
  getSelectedIds: () => string[];
  focusFirst: () => void;
}

interface FileTreeProps {
  rootNodes: TreeNode[];
  loading: boolean;
  error: string | null;
  loadSubtree: (path: string) => void | Promise<void>;
  onActivateFile: (path: string) => void;
  onSelectionChange: (paths: string[]) => void;
  onMove?: (args: {
    dragIds: string[];
    parentId: string | null;
    index: number;
    altKey: boolean;
  }) => void | Promise<void>;
  onRename?: (args: { id: string; name: string }) => void | Promise<void>;
}

export const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(function FileTree(
  {
    rootNodes,
    loading,
    error,
    loadSubtree,
    onActivateFile,
    onSelectionChange,
    onMove,
    onRename,
  },
  ref,
) {
  const treeApiRef = useRef<TreeApi<TreeNode> | undefined>(undefined);

  useImperativeHandle(
    ref,
    () => ({
      beginRename: (id) => {
        void treeApiRef.current?.edit(id);
      },
      beginCreate: ({ type, parentId }) => {
        void treeApiRef.current?.create({ type, parentId });
      },
      selectAll: () => treeApiRef.current?.selectAll(),
      deselectAll: () => treeApiRef.current?.deselectAll(),
      getSelectedIds: () =>
        treeApiRef.current ? Array.from(treeApiRef.current.selectedIds) : [],
      focusFirst: () => {
        const first = treeApiRef.current?.visibleNodes[0];
        if (first) treeApiRef.current?.focus(first.id);
      },
    }),
    [],
  );

  const handleSelect = useCallback(
    (nodes: NodeApi<TreeNode>[]) => {
      onSelectionChange(nodes.map((n) => n.data.path));
    },
    [onSelectionChange],
  );

  // react-arborist's onMove doesn't expose the original drag event, so we
  // capture Alt key state from native dragstart on the tree container and
  // expose it via a ref for the move handler.
  const dragAltKeyRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onDragStart = (e: DragEvent) => {
      dragAltKeyRef.current = e.altKey;
    };
    const onDragOver = (e: DragEvent) => {
      // Update on hover so user can toggle Alt mid-drag.
      dragAltKeyRef.current = e.altKey;
    };
    node.addEventListener('dragstart', onDragStart);
    node.addEventListener('dragover', onDragOver);
    return () => {
      node.removeEventListener('dragstart', onDragStart);
      node.removeEventListener('dragover', onDragOver);
    };
  }, []);

  if (loading) return <div className="p-3 text-xs text-muted-foreground">Loading…</div>;
  if (error) return <div className="p-3 text-xs text-destructive">{error}</div>;

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden">
      <Tree<TreeNode>
        ref={treeApiRef}
        data={rootNodes}
        openByDefault={false}
        width="100%"
        height={800}
        indent={16}
        rowHeight={24}
        onSelect={handleSelect}
        onMove={
          onMove
            ? async ({ dragIds, parentId, index }) => {
                await onMove({
                  dragIds,
                  parentId,
                  index,
                  altKey: dragAltKeyRef.current,
                });
              }
            : undefined
        }
        onRename={
          onRename ? ({ id, name }) => onRename({ id, name }) : undefined
        }
      >
        {(props) => (
          <Node {...props} onOpenDir={loadSubtree} onActivateFile={onActivateFile} />
        )}
      </Tree>
    </div>
  );
});

