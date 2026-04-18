'use client';

import { useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { PanelContentType } from '@/stores/use-split-layout-store';
import { FileExplorerPanel } from '@/components/panels/file-explorer/file-explorer-panel';
import { EditorPanel } from '@/components/panels/editor/editor-panel';
import { TerminalPanel } from '@/components/panels/terminal/terminal-panel';
import { ClaudeChatPanel } from '@/components/panels/claude/claude-chat-panel';
import { PreviewPanel } from '@/components/panels/preview/preview-panel';
import { DropZoneOverlay } from '@/components/dnd/drop-zone-overlay';
import { useDndMonitor } from '@/components/dnd/dnd-provider';
import { PanelErrorBoundary } from './error-boundary';

interface LeafPanelProps {
  leafId: string;
  panelType: PanelContentType;
}

export function LeafPanel({ leafId, panelType }: LeafPanelProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `leaf-drop-${leafId}`,
    data: { leafId, panelType },
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const { activeZone, isDragging } = useDndMonitor(leafId, containerRef);

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className="relative h-full w-full"
      data-leaf-id={leafId}
    >
      <PanelErrorBoundary panelType={panelType}>
        {renderPanel(panelType, leafId)}
      </PanelErrorBoundary>
      <DropZoneOverlay
        activeZone={activeZone}
        visible={isDragging && isOver}
      />
    </div>
  );
}

function renderPanel(panelType: PanelContentType, leafId: string) {
  switch (panelType) {
    case 'fileExplorer':
      return <FileExplorerPanel leafId={leafId} />;
    case 'editor':
      return <EditorPanel leafId={leafId} />;
    case 'terminal':
      return <TerminalPanel leafId={leafId} />;
    case 'claude':
      return <ClaudeChatPanel leafId={leafId} />;
    case 'preview':
      return <PreviewPanel leafId={leafId} />;
    default:
      return null;
  }
}
