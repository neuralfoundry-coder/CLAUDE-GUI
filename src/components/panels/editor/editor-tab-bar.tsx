'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/stores/use-editor-store';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';

export function EditorTabBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs);
  const closeAllTabs = useEditorStore((s) => s.closeAllTabs);
  const closeTabsToTheRight = useEditorStore((s) => s.closeTabsToTheRight);

  if (tabs.length === 0) return null;

  return (
    <div
      className="scrollbar-thin flex h-8 items-center overflow-x-auto border-b glass-surface"
      aria-label="Open files"
    >
      {tabs.map((tab, index) => {
        const name = tab.path.split('/').pop() ?? tab.path;
        const isActive = activeTabId === tab.id;
        const isLast = index === tabs.length - 1;

        return (
          <ContextMenu key={tab.id}>
            <ContextMenuTrigger asChild>
              <div
                className={cn(
                  'flex h-8 shrink-0 items-center gap-1.5 border-r px-3 text-xs',
                  isActive && 'bg-background',
                  !isActive && 'hover:bg-accent',
                )}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1.5 bg-transparent"
                  aria-label={`Activate ${name}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="truncate">{name}</span>
                  {tab.dirty && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-foreground"
                      aria-label="unsaved changes"
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  aria-label={`Close ${name}`}
                  className="ml-1 rounded p-0.5 hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => closeTab(tab.id)}>
                Close
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => closeOtherTabs(tab.id)}
                disabled={tabs.length <= 1}
              >
                Close Others
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => closeTabsToTheRight(tab.id)}
                disabled={isLast}
              >
                Close to the Right
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => closeAllTabs()}>
                Close All
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}
