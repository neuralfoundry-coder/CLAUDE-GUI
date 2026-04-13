'use client';

import { useEffect } from 'react';
import { Loader2, Map } from 'lucide-react';
import { EditorTabBar } from './editor-tab-bar';
import { MonacoEditorWrapper } from './monaco-editor-wrapper';
import { MonacoDiffWrapper } from './monaco-diff-wrapper';
import { DiffAcceptBar } from './diff-accept-bar';
import { EditorSettingsDropdown } from './editor-settings-dropdown';
import { useEditorStore } from '@/stores/use-editor-store';
import { useSettingsStore } from '@/stores/use-settings-store';
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';
import { useFilesWebSocket } from '@/components/panels/file-explorer/use-files-websocket';
import { usePanelFocus } from '@/hooks/use-panel-focus';
import { PanelZoomControls } from '@/components/panels/panel-zoom-controls';
import { getLanguageFromPath, getLanguageDisplayName } from '@/lib/editor/language-map';
import { cn } from '@/lib/utils';

interface EditorPanelProps {
  leafId?: string;
}

export function EditorPanel({ leafId }: EditorPanelProps) {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === activeTabId));
  const saveFile = useEditorStore((s) => s.saveFile);
  const syncExternalChange = useEditorStore((s) => s.syncExternalChange);
  const tabs = useEditorStore((s) => s.tabs);
  const cursorLine = useEditorStore((s) => s.cursorLine);
  const cursorCol = useEditorStore((s) => s.cursorCol);
  const completionLoading = useEditorStore((s) => s.completionLoading);
  const minimapEnabled = useSettingsStore((s) => s.editorMinimapEnabled);
  const toggleMinimap = useSettingsStore((s) => s.setEditorMinimapEnabled);
  const panelFocus = usePanelFocus('editor');

  useKeyboardShortcut([
    {
      key: 's',
      meta: true,
      ctrl: true,
      handler: () => {
        if (activeTabId) saveFile(activeTabId).catch(console.error);
      },
    },
  ]);

  useFilesWebSocket((event) => {
    if (event.event === 'change') {
      syncExternalChange(event.path);
    }
  });

  useEffect(() => {
    if (!activeTabId && tabs.length > 0) {
      useEditorStore.setState({ activeTabId: tabs[0]!.id });
    }
  }, [activeTabId, tabs]);

  const showDiff = Boolean(activeTab?.diff);
  const languageId = activeTab ? getLanguageFromPath(activeTab.path) : null;
  const languageLabel = languageId ? getLanguageDisplayName(languageId) : null;

  return (
    <div
      className="flex h-full flex-col panel-container bg-background"
      data-panel-id="editor"
      onMouseDown={panelFocus.onMouseDown}
      onFocus={panelFocus.onFocus}
    >
      {/* Panel header */}
      <div className="flex h-7 items-center justify-between border-b glass-surface glass-highlight relative px-3">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Editor
        </span>
        <div className="flex items-center gap-2">
          <PanelZoomControls panelId="editor" />
          {completionLoading && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
          {languageLabel && (
            <span className="text-[10px] text-muted-foreground">{languageLabel}</span>
          )}
          {cursorLine != null && cursorCol != null && activeTab && (
            <span className="text-[10px] text-muted-foreground">
              Ln {cursorLine}, Col {cursorCol}
            </span>
          )}
          <button
            type="button"
            onClick={() => toggleMinimap(!minimapEnabled)}
            className={cn(
              'flex items-center gap-1 rounded px-1 py-0.5 text-[10px] transition-colors',
              minimapEnabled
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
            aria-label={minimapEnabled ? 'Hide minimap' : 'Show minimap'}
            title={minimapEnabled ? 'Minimap ON' : 'Minimap OFF'}
          >
            <Map className="h-3 w-3" />
          </button>
          <EditorSettingsDropdown />
        </div>
      </div>

      <EditorTabBar leafId={leafId} />
      <DiffAcceptBar />
      <div className="flex-1 overflow-hidden">
        {!activeTabId || !activeTab ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No file open. Select a file from the explorer.
          </div>
        ) : showDiff && activeTab.diff ? (
          <MonacoDiffWrapper
            original={activeTab.diff.original}
            modified={activeTab.diff.modified}
            language={getLanguageFromPath(activeTab.path)}
          />
        ) : (
          <MonacoEditorWrapper tabId={activeTabId} />
        )}
      </div>
    </div>
  );
}
