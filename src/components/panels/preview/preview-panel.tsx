'use client';

import { usePreviewStore, detectPreviewType } from '@/stores/use-preview-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { PreviewRouter } from './preview-router';

export function PreviewPanel() {
  const currentFile = usePreviewStore((s) => s.currentFile);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === activeTabId));
  const path = currentFile ?? activeTab?.path ?? null;
  const type = detectPreviewType(path);

  return (
    <div className="flex h-full flex-col border-l bg-background">
      <div className="flex h-7 items-center justify-between border-b bg-muted px-3">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Preview</span>
        <span className="text-[10px] uppercase text-muted-foreground">{type !== 'none' ? type : ''}</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <PreviewRouter />
      </div>
    </div>
  );
}
