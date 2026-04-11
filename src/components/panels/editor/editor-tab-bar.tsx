'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/stores/use-editor-store';

export function EditorTabBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);

  if (tabs.length === 0) return null;

  return (
    <div className="scrollbar-thin flex h-8 items-center overflow-x-auto border-b bg-muted">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            'flex h-8 items-center gap-1.5 border-r px-3 text-xs hover:bg-accent',
            activeTabId === tab.id && 'bg-background',
          )}
        >
          <span className="truncate">{tab.path.split('/').pop()}</span>
          {tab.dirty && <span className="h-1.5 w-1.5 rounded-full bg-foreground" />}
          <span
            role="button"
            className="ml-1 rounded p-0.5 hover:bg-muted-foreground/20"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            <X className="h-3 w-3" />
          </span>
        </button>
      ))}
    </div>
  );
}
