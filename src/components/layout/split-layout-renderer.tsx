'use client';

import { useEffect, useRef } from 'react';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from 'react-resizable-panels';
import { useSplitLayoutStore, type LayoutNode, type LeafNode, type SplitNode } from '@/stores/use-split-layout-store';
import { LeafPanel } from './leaf-panel';
import { useSettingsStore } from '@/stores/use-settings-store';

interface SplitLayoutRendererProps {
  node: LayoutNode;
}

export function SplitLayoutRenderer({ node }: SplitLayoutRendererProps) {
  if (node.type === 'leaf') {
    return <StandaloneLeafRenderer leaf={node} />;
  }
  return <SplitRenderer split={node} />;
}

function SplitRenderer({ split }: { split: SplitNode }) {
  const panelRounding = useSettingsStore((s) => s.panelRounding);

  const handleClass = split.direction === 'horizontal'
    ? (panelRounding
        ? 'w-1 bg-transparent hover:bg-accent/50 transition-colors'
        : 'w-1 bg-border hover:bg-accent transition-colors')
    : (panelRounding
        ? 'h-1 bg-transparent hover:bg-accent/50 transition-colors'
        : 'h-1 bg-border hover:bg-accent transition-colors');

  return (
    <PanelGroup
      direction={split.direction}
      autoSaveId={split.autoSaveId}
    >
      <ChildPanel node={split.children[0]} defaultSize={split.ratio} />
      <PanelResizeHandle className={handleClass} />
      <ChildPanel node={split.children[1]} defaultSize={100 - split.ratio} />
    </PanelGroup>
  );
}

/**
 * Renders a child node within a Panel.
 * - If the child is a leaf, the Panel gets collapsible + size constraints from the leaf.
 * - If the child is a split, the Panel wraps the nested SplitRenderer with the split's minSize.
 */
function ChildPanel({ node, defaultSize }: { node: LayoutNode; defaultSize: number }) {
  if (node.type === 'leaf') {
    return <LeafChildPanel leaf={node} defaultSize={defaultSize} />;
  }
  return (
    <Panel
      id={node.id}
      defaultSize={defaultSize}
      minSize={node.minSize ?? 10}
    >
      <SplitRenderer split={node} />
    </Panel>
  );
}

function LeafChildPanel({ leaf, defaultSize }: { leaf: LeafNode; defaultSize: number }) {
  const setLeafCollapsed = useSplitLayoutStore((s) => s.setLeafCollapsed);
  const panelRef = useRef<ImperativePanelHandle>(null);

  useEffect(() => {
    if (leaf.collapsed) {
      panelRef.current?.collapse();
    } else {
      panelRef.current?.expand();
    }
  }, [leaf.collapsed]);

  return (
    <Panel
      ref={panelRef}
      id={leaf.id}
      defaultSize={defaultSize}
      minSize={leaf.minSize ?? 10}
      maxSize={leaf.maxSize}
      collapsible
      collapsedSize={0}
      onCollapse={() => setLeafCollapsed(leaf.id, true)}
      onExpand={() => setLeafCollapsed(leaf.id, false)}
    >
      <LeafPanel leafId={leaf.id} panelType={leaf.panelType} />
    </Panel>
  );
}

/** Standalone leaf renderer — used only when a leaf is the root node. */
function StandaloneLeafRenderer({ leaf }: { leaf: LeafNode }) {
  return (
    <div className="h-full w-full">
      <LeafPanel leafId={leaf.id} panelType={leaf.panelType} />
    </div>
  );
}
