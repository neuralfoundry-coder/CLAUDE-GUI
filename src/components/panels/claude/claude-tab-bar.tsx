'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, X, Columns2, Rows2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { useClaudeStore } from '@/stores/use-claude-store';
import { useSplitLayoutStore } from '@/stores/use-split-layout-store';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableTabItem } from '@/components/dnd/sortable-tab-item';
import type { DragData } from '@/components/dnd/dnd-provider';

interface ClaudeTabBarProps {
  leafId?: string;
}

export function ClaudeTabBar({ leafId }: ClaudeTabBarProps) {
  const tabs = useClaudeStore((s) => s.tabs);
  const activeTabId = useClaudeStore((s) => s.activeTabId);
  const tabStates = useClaudeStore((s) => s.tabStates);
  const setActiveTab = useClaudeStore((s) => s.setActiveTab);
  const closeTab = useClaudeStore((s) => s.closeTab);
  const createTab = useClaudeStore((s) => s.createTab);
  const renameTab = useClaudeStore((s) => s.renameTab);
  const splitLeaf = useSplitLayoutStore((s) => s.splitLeaf);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const startRename = useCallback((tabId: string, currentName: string) => {
    setEditingTabId(tabId);
    setEditValue(currentName);
  }, []);

  const commitRename = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      renameTab(editingTabId, editValue.trim());
    }
    setEditingTabId(null);
    setEditValue('');
  }, [editingTabId, editValue, renameTab]);

  const cancelRename = useCallback(() => {
    setEditingTabId(null);
    setEditValue('');
  }, []);

  const handleCloseOthers = useCallback(
    (tabId: string) => {
      const otherIds = tabs.filter((t) => t.id !== tabId).map((t) => t.id);
      for (const id of otherIds) closeTab(id);
    },
    [tabs, closeTab],
  );

  const handleCloseToRight = useCallback(
    (tabId: string) => {
      const idx = tabs.findIndex((t) => t.id === tabId);
      if (idx < 0) return;
      const rightIds = tabs.slice(idx + 1).map((t) => t.id);
      for (const id of rightIds) closeTab(id);
    },
    [tabs, closeTab],
  );

  const tabIds = tabs.map((t) => t.id);

  return (
    <div className="flex h-7 items-center border-b glass-surface">
      <div className="flex flex-1 items-center overflow-x-auto">
        <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const ts = tabStates[tab.id];
            const isStreaming = ts?.isStreaming ?? false;
            const isEditing = editingTabId === tab.id;
            const dragData: DragData = {
              tabId: tab.id,
              sourceType: 'claude',
            };

            return (
              <SortableTabItem key={tab.id} id={tab.id} dragData={dragData}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div
                      className={cn(
                        'group relative flex h-7 shrink-0 items-center border-r text-[11px]',
                        isActive
                          ? 'bg-background text-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )}
                      title={tab.sessionId ? `Session: ${tab.sessionId}` : 'New session'}
                    >
                      <button
                        type="button"
                        className="flex items-center gap-1 bg-transparent px-2 py-0 pr-6 text-inherit"
                        onClick={() => setActiveTab(tab.id)}
                        onDoubleClick={() => startRename(tab.id, tab.name)}
                        aria-label={`Activate ${tab.name}`}
                      >
                        {/* Status dot */}
                        <span
                          className={cn(
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            isStreaming
                              ? 'animate-pulse bg-orange-400'
                              : tab.sessionId
                                ? 'bg-emerald-400'
                                : 'bg-zinc-400',
                          )}
                          aria-hidden="true"
                        />

                        {/* Tab name / inline edit */}
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') cancelRename();
                            }}
                            onBlur={commitRename}
                            className="w-20 bg-transparent text-[11px] outline-none"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Rename tab"
                          />
                        ) : (
                          <span className="max-w-[120px] truncate">{tab.name}</span>
                        )}
                      </button>

                      {/* Close button — sibling of the activator, not nested inside it */}
                      {!isEditing && (
                        <button
                          type="button"
                          className={cn(
                            'absolute right-1 top-1/2 flex h-4 w-4 shrink-0 -translate-y-1/2 items-center justify-center rounded-sm',
                            'opacity-0 hover:bg-muted-foreground/20 group-hover:opacity-100',
                            isActive && 'opacity-60',
                          )}
                          onClick={() => closeTab(tab.id)}
                          aria-label={`Close ${tab.name}`}
                          title={`Close ${tab.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => closeTab(tab.id)}>
                      Close
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() => handleCloseOthers(tab.id)}
                      disabled={tabs.length <= 1}
                    >
                      Close Others
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() => handleCloseToRight(tab.id)}
                      disabled={tabs.findIndex((t) => t.id === tab.id) === tabs.length - 1}
                    >
                      Close to the Right
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => startRename(tab.id, tab.name)}>
                      Rename
                    </ContextMenuItem>
                    {leafId && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => splitLeaf(leafId, 'horizontal', 'claude', 'after')}>
                          <Columns2 className="mr-2 h-3 w-3" />
                          Split Right
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => splitLeaf(leafId, 'vertical', 'claude', 'after')}>
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

      {/* New tab button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 rounded-none border-l"
        onClick={() => createTab()}
        title="New chat tab"
        aria-label="New chat tab"
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
