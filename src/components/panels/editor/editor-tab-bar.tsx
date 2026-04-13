'use client';

import { X, Columns2, Rows2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/stores/use-editor-store';
import { useSplitLayoutStore } from '@/stores/use-split-layout-store';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableTabItem } from '@/components/dnd/sortable-tab-item';
import type { DragData } from '@/components/dnd/dnd-provider';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';

interface EditorTabBarProps {
  leafId?: string;
}

export function EditorTabBar({ leafId }: EditorTabBarProps) {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs);
  const closeAllTabs = useEditorStore((s) => s.closeAllTabs);
  const closeTabsToTheRight = useEditorStore((s) => s.closeTabsToTheRight);
  const splitLeaf = useSplitLayoutStore((s) => s.splitLeaf);

  if (tabs.length === 0) return null;

  const tabIds = tabs.map((t) => t.id);

  return (
    <div
      className="scrollbar-thin flex h-8 items-center overflow-x-auto border-b glass-surface"
      aria-label="Open files"
    >
      <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
        {tabs.map((tab, index) => {
          const name = tab.path.split('/').pop() ?? tab.path;
          const isActive = activeTabId === tab.id;
          const isLast = index === tabs.length - 1;
          const dragData: DragData = {
            tabId: tab.id,
            sourceType: 'editor',
          };

          return (
            <SortableTabItem key={tab.id} id={tab.id} dragData={dragData}>
              <ContextMenu>
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
                  {leafId && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem onSelect={() => splitLeaf(leafId, 'horizontal', 'editor', 'after')}>
                        <Columns2 className="mr-2 h-3 w-3" />
                        Split Right
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => splitLeaf(leafId, 'vertical', 'editor', 'after')}>
                        <Rows2 className="mr-2 h-3 w-3" />
                        Split Down
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            </SortableTabItem>
          );
        })}
      </SortableContext>
    </div>
  );
}
