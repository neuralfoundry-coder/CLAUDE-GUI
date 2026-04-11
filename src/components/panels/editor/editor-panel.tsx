'use client';

import { useEffect } from 'react';
import { EditorTabBar } from './editor-tab-bar';
import { MonacoEditorWrapper } from './monaco-editor-wrapper';
import { MonacoDiffWrapper } from './monaco-diff-wrapper';
import { DiffAcceptBar } from './diff-accept-bar';
import { useEditorStore } from '@/stores/use-editor-store';
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';
import { useFilesWebSocket } from '@/components/panels/file-explorer/use-files-websocket';

function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    html: 'html',
    css: 'css',
    py: 'python',
    go: 'go',
    rs: 'rust',
  };
  return map[ext] ?? 'plaintext';
}

export function EditorPanel() {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === activeTabId));
  const saveFile = useEditorStore((s) => s.saveFile);
  const syncExternalChange = useEditorStore((s) => s.syncExternalChange);
  const tabs = useEditorStore((s) => s.tabs);

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

  return (
    <div className="flex h-full flex-col bg-background">
      <EditorTabBar />
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
            language={getLanguage(activeTab.path)}
          />
        ) : (
          <MonacoEditorWrapper tabId={activeTabId} />
        )}
      </div>
    </div>
  );
}
