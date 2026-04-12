'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from 'react-resizable-panels';
import { useShallow } from 'zustand/shallow';
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
import { RemoteAccessModal } from '@/components/modals/remote-access-modal';
import { McpServersModal } from '@/components/modals/mcp-servers-modal';
import { CommandPalette } from '@/components/command-palette/command-palette';
import { MobileShell } from './mobile-shell';
import { useSettingsStore } from '@/stores/use-settings-store';
import { useRemoteAccessStore } from '@/stores/use-remote-access-store';
import { useMcpStore } from '@/stores/use-mcp-store';
import { useLayoutStore, DEFAULT_PANEL_SIZES } from '@/stores/use-layout-store';
import { useProjectStore } from '@/stores/use-project-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { usePreviewStore } from '@/stores/use-preview-store';
import { useTheme } from '@/hooks/use-theme';
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { useMediaQuery } from '@/hooks/use-media-query';
import { getClaudeClient } from '@/lib/websocket/claude-client';
import { getFilesClient } from '@/lib/websocket/files-client';
import { terminalManager } from '@/lib/terminal/terminal-manager';
import { useState } from 'react';

export function AppShell() {
  useTheme();
  useGlobalShortcuts();
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const activeRoot = useProjectStore((s) => s.activeRoot);
  const projectInitialized = useProjectStore((s) => s.initialized);

  // Force-open the project picker on first boot when no project is active.
  useEffect(() => {
    if (projectInitialized && !activeRoot) setProjectPickerOpen(true);
  }, [projectInitialized, activeRoot]);

  // Fetch remote access status on mount
  useEffect(() => {
    useRemoteAccessStore.getState().fetchStatus();
  }, []);

  useEffect(() => {
    // Boot shared WebSocket clients so connection status updates early.
    getClaudeClient();
    getFilesClient().start();
    terminalManager.boot();
    terminalManager.setFileLinkHandler((path, line, col) => {
      const projectRoot = useProjectStore.getState().activeRoot;
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

  // Panel collapsed states — single subscription with shallow equality.
  const {
    fileExplorerCollapsed,
    editorCollapsed,
    terminalCollapsed,
    claudeCollapsed,
    previewCollapsed,
    setCollapsed,
    togglePanel,
  } = useLayoutStore(useShallow((s) => ({
    fileExplorerCollapsed: s.fileExplorerCollapsed,
    editorCollapsed: s.editorCollapsed,
    terminalCollapsed: s.terminalCollapsed,
    claudeCollapsed: s.claudeCollapsed,
    previewCollapsed: s.previewCollapsed,
    setCollapsed: s.setCollapsed,
    togglePanel: s.togglePanel,
  })));

  // Imperative refs for all panels
  const fileExplorerRef = useRef<ImperativePanelHandle>(null);
  const editorRef = useRef<ImperativePanelHandle>(null);
  const terminalRef = useRef<ImperativePanelHandle>(null);
  const claudeRef = useRef<ImperativePanelHandle>(null);
  const previewRef = useRef<ImperativePanelHandle>(null);

  // Sync store → imperative API
  useEffect(() => {
    if (fileExplorerCollapsed) fileExplorerRef.current?.collapse();
    else fileExplorerRef.current?.expand();
  }, [fileExplorerCollapsed]);

  useEffect(() => {
    if (editorCollapsed) editorRef.current?.collapse();
    else editorRef.current?.expand();
  }, [editorCollapsed]);

  useEffect(() => {
    if (terminalCollapsed) terminalRef.current?.collapse();
    else terminalRef.current?.expand();
  }, [terminalCollapsed]);

  useEffect(() => {
    if (claudeCollapsed) claudeRef.current?.collapse();
    else claudeRef.current?.expand();
  }, [claudeCollapsed]);

  useEffect(() => {
    if (previewCollapsed) previewRef.current?.collapse();
    else previewRef.current?.expand();
  }, [previewCollapsed]);

  // Double-click handler to reset adjacent panels to default sizes
  const handleDoubleClickReset = useCallback(
    (...refs: Array<{ ref: React.RefObject<ImperativePanelHandle | null>; defaultSize: number }>) => {
      return () => {
        for (const { ref, defaultSize } of refs) {
          ref.current?.resize(defaultSize);
        }
      };
    },
    [],
  );

  useKeyboardShortcut([
    { key: 'b', meta: true, ctrl: true, handler: () => togglePanel('fileExplorer') },
    { key: 'j', meta: true, ctrl: true, handler: () => togglePanel('terminal') },
    { key: 'k', meta: true, ctrl: true, handler: () => togglePanel('claude') },
    { key: 'e', meta: true, ctrl: true, handler: () => togglePanel('editor') },
    { key: 'p', meta: true, ctrl: true, handler: () => togglePanel('preview') },
  ]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        onOpenProjectPicker={() => setProjectPickerOpen(true)}
        onOpenLoginPrompt={() => setLoginPromptOpen(true)}
      />
      <div className="flex-1 overflow-hidden">
        {isDesktop ? (
          <PanelGroup direction="horizontal" autoSaveId="claudegui-root">
            <Panel
              ref={fileExplorerRef}
              id="file-explorer"
              order={1}
              defaultSize={DEFAULT_PANEL_SIZES.fileExplorer}
              minSize={10}
              maxSize={40}
              collapsible
              collapsedSize={0}
              onCollapse={() => setCollapsed('fileExplorer', true)}
              onExpand={() => setCollapsed('fileExplorer', false)}
            >
              <FileExplorerPanel />
            </Panel>
            <PanelResizeHandle
              className="w-1 bg-border hover:bg-accent transition-colors"
              onDoubleClick={handleDoubleClickReset(
                { ref: fileExplorerRef, defaultSize: DEFAULT_PANEL_SIZES.fileExplorer },
              )}
            />
            <Panel
              id="center"
              order={2}
              defaultSize={DEFAULT_PANEL_SIZES.center}
              minSize={20}
            >
              <PanelGroup direction="vertical" autoSaveId="claudegui-center">
                <Panel
                  ref={editorRef}
                  id="editor"
                  order={1}
                  defaultSize={DEFAULT_PANEL_SIZES.editor}
                  minSize={10}
                  collapsible
                  collapsedSize={0}
                  onCollapse={() => setCollapsed('editor', true)}
                  onExpand={() => setCollapsed('editor', false)}
                >
                  <EditorPanel />
                </Panel>
                <PanelResizeHandle
                  className="h-1 bg-border hover:bg-accent transition-colors"
                  onDoubleClick={handleDoubleClickReset(
                    { ref: editorRef, defaultSize: DEFAULT_PANEL_SIZES.editor },
                    { ref: terminalRef, defaultSize: DEFAULT_PANEL_SIZES.terminal },
                  )}
                />
                <Panel
                  ref={terminalRef}
                  id="terminal"
                  order={2}
                  defaultSize={DEFAULT_PANEL_SIZES.terminal}
                  minSize={10}
                  collapsible
                  collapsedSize={0}
                  onCollapse={() => setCollapsed('terminal', true)}
                  onExpand={() => setCollapsed('terminal', false)}
                >
                  <TerminalPanel />
                </Panel>
              </PanelGroup>
            </Panel>
            <PanelResizeHandle
              className="w-1 bg-border hover:bg-accent transition-colors"
              onDoubleClick={handleDoubleClickReset(
                { ref: claudeRef, defaultSize: DEFAULT_PANEL_SIZES.claude },
              )}
            />
            <Panel
              ref={claudeRef}
              id="claude"
              order={3}
              defaultSize={DEFAULT_PANEL_SIZES.claude}
              minSize={10}
              maxSize={40}
              collapsible
              collapsedSize={0}
              onCollapse={() => setCollapsed('claude', true)}
              onExpand={() => setCollapsed('claude', false)}
            >
              <ClaudeChatPanel />
            </Panel>
            <PanelResizeHandle
              className="w-1 bg-border hover:bg-accent transition-colors"
              onDoubleClick={handleDoubleClickReset(
                { ref: previewRef, defaultSize: DEFAULT_PANEL_SIZES.preview },
              )}
            />
            <Panel
              ref={previewRef}
              id="preview"
              order={4}
              defaultSize={DEFAULT_PANEL_SIZES.preview}
              minSize={10}
              maxSize={50}
              collapsible
              collapsedSize={0}
              onCollapse={() => setCollapsed('preview', true)}
              onExpand={() => setCollapsed('preview', false)}
            >
              <PreviewPanel />
            </Panel>
          </PanelGroup>
        ) : (
          <MobileShell />
        )}
      </div>
      <StatusBar />
      <PermissionRequestModal />
      <PermissionRulesModalHost />
      <ProjectPickerModal open={projectPickerOpen} onOpenChange={setProjectPickerOpen} />
      <LoginPromptModal open={loginPromptOpen} onOpenChange={setLoginPromptOpen} />
      <ArtifactsModal />
      <RemoteAccessModalHost />
      <McpServersModalHost />
      <CommandPalette />
    </div>
  );
}

function RemoteAccessModalHost() {
  const open = useRemoteAccessStore((s) => s.modalOpen);
  const close = useRemoteAccessStore((s) => s.closeModal);
  return <RemoteAccessModal open={open} onOpenChange={(v) => { if (!v) close(); }} />;
}

function PermissionRulesModalHost() {
  const open = useSettingsStore((s) => s.rulesModalOpen);
  const close = useSettingsStore((s) => s.closeRulesModal);
  return <PermissionRulesModal open={open} onOpenChange={(v) => !v && close()} />;
}

function McpServersModalHost() {
  const open = useMcpStore((s) => s.modalOpen);
  const close = useMcpStore((s) => s.closeModal);
  return <McpServersModal open={open} onOpenChange={(v) => { if (!v) close(); }} />;
}
