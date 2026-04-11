'use client';

import { useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Header } from './header';
import { StatusBar } from './status-bar';
import { FileExplorerPanel } from '@/components/panels/file-explorer/file-explorer-panel';
import { EditorPanel } from '@/components/panels/editor/editor-panel';
import { TerminalPanel } from '@/components/panels/terminal/terminal-panel';
import { PreviewPanel } from '@/components/panels/preview/preview-panel';
import { ClaudeChatPanel } from '@/components/panels/claude/claude-chat-panel';
import { PermissionRequestModal } from '@/components/modals/permission-request-modal';
import { PermissionRulesModal } from '@/components/modals/permission-rules-modal';
import { ProjectPickerModal } from '@/components/modals/project-picker-modal';
import { LoginPromptModal } from '@/components/modals/login-prompt-modal';
import { ArtifactsModal } from '@/components/modals/artifacts-modal';
import { CommandPalette } from '@/components/command-palette/command-palette';
import { useSettingsStore } from '@/stores/use-settings-store';
import { useLayoutStore } from '@/stores/use-layout-store';
import { useProjectStore } from '@/stores/use-project-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { usePreviewStore } from '@/stores/use-preview-store';
import { useTheme } from '@/hooks/use-theme';
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { getClaudeClient } from '@/lib/websocket/claude-client';
import { getFilesClient } from '@/lib/websocket/files-client';
import { terminalManager } from '@/lib/terminal/terminal-manager';
import { useState } from 'react';

export function AppShell() {
  useTheme();
  useGlobalShortcuts();
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);

  useEffect(() => {
    // Boot shared WebSocket clients so connection status updates early.
    getClaudeClient();
    getFilesClient().start();
    terminalManager.boot();
    terminalManager.setFileLinkHandler((path, line, col) => {
      const projectRoot = useProjectStore.getState().activeRoot;
      // Prefer a path relative to the project root so the editor store's
      // `filesApi.read(relativePath)` succeeds (the server resolves it
      // against the active root via `resolveSafe`).
      let target = path;
      if (projectRoot && path.startsWith(projectRoot)) {
        target = path.slice(projectRoot.length).replace(/^[/\\]+/, '');
      }
      if (!target) target = path;
      void useEditorStore.getState().openFile(target, { line, col });
    });
    void useProjectStore.getState().refresh();

    const unsubscribe = getFilesClient().subscribeProjectChange((evt) => {
      useProjectStore.getState().applyRemoteChange(evt.root);
      useEditorStore.getState().resetAll();
      usePreviewStore.getState().setFile(null);
    });
    return unsubscribe;
  }, []);

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
      <Header
        onOpenProjectPicker={() => setProjectPickerOpen(true)}
        onOpenLoginPrompt={() => setLoginPromptOpen(true)}
      />
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
      <PermissionRulesModalHost />
      <ProjectPickerModal open={projectPickerOpen} onOpenChange={setProjectPickerOpen} />
      <LoginPromptModal open={loginPromptOpen} onOpenChange={setLoginPromptOpen} />
      <ArtifactsModal />
      <CommandPalette />
    </div>
  );
}

function PermissionRulesModalHost() {
  const open = useSettingsStore((s) => s.rulesModalOpen);
  const close = useSettingsStore((s) => s.closeRulesModal);
  return <PermissionRulesModal open={open} onOpenChange={(v) => !v && close()} />;
}
