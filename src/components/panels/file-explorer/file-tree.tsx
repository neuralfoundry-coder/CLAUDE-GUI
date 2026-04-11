'use client';

import { useMemo } from 'react';
import { Tree, type NodeRendererProps } from 'react-arborist';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { FileIcon } from './file-icon';
import { useFileTree, type TreeNode } from './use-file-tree';
import { filesApi } from '@/lib/api-client';
import { useEditorStore } from '@/stores/use-editor-store';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

function Node({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const openFile = useEditorStore((s) => s.openFile);

  const onClick = () => {
    if (node.data.isDirectory) {
      node.toggle();
    } else {
      openFile(node.data.path);
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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={dragHandle}
          style={style}
          className={cn(
            'flex cursor-pointer items-center gap-1 px-2 text-sm hover:bg-accent',
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
          <span className="truncate">{node.data.name}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
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

export function FileTree() {
  const { rootNodes, loading, error, loadDirectory } = useFileTree();
  const data = useMemo(() => rootNodes, [rootNodes]);

  if (loading) return <div className="p-3 text-xs text-muted-foreground">Loading…</div>;
  if (error) return <div className="p-3 text-xs text-destructive">{error}</div>;

  return (
    <div className="flex-1 overflow-hidden">
      <Tree<TreeNode>
        data={data}
        openByDefault={false}
        width="100%"
        height={800}
        indent={16}
        rowHeight={24}
        childrenAccessor={(d) => (d.children === undefined ? null : d.children)}
        onToggle={async (id) => {
          const node = data.find((n) => n.id === id);
          if (node && node.isDirectory && !node.children) {
            node.children = await loadDirectory(node.path);
          }
        }}
      >
        {Node}
      </Tree>
    </div>
  );
}
