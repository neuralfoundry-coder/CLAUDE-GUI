'use client';

import { useEffect } from 'react';
import { EditorTabBar } from './editor-tab-bar';
import { MonacoEditorWrapper } from './monaco-editor-wrapper';
import { DiffAcceptBar } from './diff-accept-bar';
import { useEditorStore } from '@/stores/use-editor-store';
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';
import { useFilesWebSocket } from '@/components/panels/file-explorer/use-files-websocket';

export function EditorPanel() {
  const activeTabId = useEditorStore((s) => s.activeTabId);
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

  return (
    <div className="flex h-full flex-col bg-background">
      <EditorTabBar />
      <DiffAcceptBar />
      <div className="flex-1 overflow-hidden">
        {activeTabId ? (
          <MonacoEditorWrapper tabId={activeTabId} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No file open. Select a file from the explorer.
          </div>
        )}
      </div>
    </div>
  );
}
