'use client';

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Header } from './header';
import { StatusBar } from './status-bar';
import { FileExplorerPanel } from '@/components/panels/file-explorer/file-explorer-panel';
import { EditorPanel } from '@/components/panels/editor/editor-panel';
import { TerminalPanel } from '@/components/panels/terminal/terminal-panel';
import { PreviewPanel } from '@/components/panels/preview/preview-panel';
import { ClaudeChatPanel } from '@/components/panels/claude/claude-chat-panel';
import { PermissionRequestModal } from '@/components/modals/permission-request-modal';
import { CommandPalette } from '@/components/command-palette/command-palette';
import { useLayoutStore } from '@/stores/use-layout-store';
import { useTheme } from '@/hooks/use-theme';
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';

export function AppShell() {
  useTheme();
  useGlobalShortcuts();

  const fileExplorerCollapsed = useLayoutStore((s) => s.fileExplorerCollapsed);
  const terminalCollapsed = useLayoutStore((s) => s.terminalCollapsed);
  const previewCollapsed = useLayoutStore((s) => s.previewCollapsed);
  const togglePanel = useLayoutStore((s) => s.togglePanel);

  useKeyboardShortcut([
    { key: 'b', meta: true, ctrl: true, handler: () => togglePanel('fileExplorer') },
    { key: 'j', meta: true, ctrl: true, handler: () => togglePanel('terminal') },
  ]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header />
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="claudegui-root">
          {!fileExplorerCollapsed && (
            <>
              <Panel id="file-explorer" order={1} defaultSize={18} minSize={10} maxSize={40}>
                <FileExplorerPanel />
              </Panel>
              <PanelResizeHandle className="w-px bg-border hover:bg-accent" />
            </>
          )}
          <Panel id="center" order={2} defaultSize={52} minSize={30}>
            <PanelGroup direction="vertical" autoSaveId="claudegui-center">
              <Panel id="editor" order={1} defaultSize={60} minSize={20}>
                <EditorPanel />
              </Panel>
              {!terminalCollapsed && (
                <>
                  <PanelResizeHandle className="h-px bg-border hover:bg-accent" />
                  <Panel id="terminal" order={2} defaultSize={40} minSize={10}>
                    <TerminalPanel />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-px bg-border hover:bg-accent" />
          <Panel id="claude" order={3} defaultSize={15} minSize={15} maxSize={30}>
            <ClaudeChatPanel />
          </Panel>
          {!previewCollapsed && (
            <>
              <PanelResizeHandle className="w-px bg-border hover:bg-accent" />
              <Panel id="preview" order={4} defaultSize={15} minSize={15} maxSize={50}>
                <PreviewPanel />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
      <StatusBar />
      <PermissionRequestModal />
      <CommandPalette />
    </div>
  );
}
