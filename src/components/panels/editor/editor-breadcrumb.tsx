'use client';

import { ChevronRight } from 'lucide-react';
import { useEditorStore } from '@/stores/use-editor-store';

export function EditorBreadcrumb() {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === activeTabId));

  if (!activeTab) return null;

  const segments = activeTab.path.split('/');

  return (
    <div className="flex h-6 items-center gap-0.5 overflow-x-auto border-b bg-background/50 px-3 scrollbar-thin">
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className="flex shrink-0 items-center gap-0.5">
            {i > 0 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            )}
            <span
              className={
                isLast
                  ? 'text-[11px] font-medium text-foreground'
                  : 'text-[11px] text-muted-foreground'
              }
            >
              {segment}
            </span>
          </span>
        );
      })}
    </div>
  );
}
