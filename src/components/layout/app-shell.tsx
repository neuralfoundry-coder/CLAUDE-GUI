'use client';

import { useEffect, useCallback } from 'react';
import { Header } from './header';
import { StatusBar } from './status-bar';
import { PermissionRequestModal } from '@/components/modals/permission-request-modal';
import { PermissionRulesModal } from '@/components/modals/permission-rules-modal';
import { ProjectPickerModal } from '@/components/modals/project-picker-modal';
import { LoginPromptModal } from '@/components/modals/login-prompt-modal';
import { ArtifactsModal } from '@/components/modals/artifacts-modal';
import { RemoteAccessModal } from '@/components/modals/remote-access-modal';
import { McpServersModal } from '@/components/modals/mcp-servers-modal';
import { RecoveryModal } from '@/components/modals/recovery-modal';
import { CommandPalette } from '@/components/command-palette/command-palette';
import { SearchOverlay } from './search-overlay';
import { ToastContainer } from './toast-container';
import { MobileShell } from './mobile-shell';
import { SplitLayoutRenderer } from './split-layout-renderer';
import { useSettingsStore } from '@/stores/use-settings-store';
import { useRemoteAccessStore } from '@/stores/use-remote-access-store';
import { useMcpStore } from '@/stores/use-mcp-store';
import { useProjectStore } from '@/stores/use-project-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { useClaudeStore } from '@/stores/use-claude-store';
import { usePreviewStore } from '@/stores/use-preview-store';
import { useFileIndexStore } from '@/stores/use-file-index-store';
import { useSplitLayoutStore } from '@/stores/use-split-layout-store';
import { useTheme } from '@/hooks/use-theme';
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useJumpToPanel, PANEL_JUMP_ORDER } from '@/hooks/use-panel-jump';
import { useBufferRecoveryPersist } from '@/hooks/use-buffer-recovery-persist';
import { useRecoveryStore } from '@/stores/use-recovery-store';
import { getClaudeClient } from '@/lib/websocket/claude-client';
import { getFilesClient } from '@/lib/websocket/files-client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { DndProvider, type DragData, type DropZone } from '@/components/dnd/dnd-provider';
import type { SplitDirection, PanelContentType } from '@/stores/use-split-layout-store';
import { ErrorBoundary } from './error-boundary';

export function AppShell() {
  // Mount gate: SSR shows a placeholder so persisted layout + matchMedia don't shift useId() counters and break Radix/PanelGroup IDs.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useTheme();
  useGlobalShortcuts();
  useBufferRecoveryPersist();
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const panelRounding = useSettingsStore((s) => s.panelRounding);
  const liquidGlass = useSettingsStore((s) => s.liquidGlass);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const activeRoot = useProjectStore((s) => s.activeRoot);
  const projectInitialized = useProjectStore((s) => s.initialized);
  const root = useSplitLayoutStore((s) => s.root);
  const togglePanelByType = useSplitLayoutStore((s) => s.togglePanelByType);

  // Force-open the project picker on first boot when no project is active.
  useEffect(() => {
    if (projectInitialized && !activeRoot) setProjectPickerOpen(true);
  }, [projectInitialized, activeRoot]);

  // Fetch remote access status on mount
  useEffect(() => {
    useRemoteAccessStore.getState().fetchStatus();
  }, []);

  // Surface unsaved buffers from a previous session, if any.
  useEffect(() => {
    useRecoveryStore.getState().refresh();
  }, []);

  useEffect(() => {
    // Boot shared WebSocket clients so connection status updates early.
    getClaudeClient();
    getFilesClient().start();
    void useProjectStore.getState().refresh();

    const unsubProject = getFilesClient().subscribeProjectChange((evt) => {
      useProjectStore.getState().applyRemoteChange(evt.root);
      useEditorStore.getState().resetAll();
      usePreviewStore.getState().setFile(null);
      useFileIndexStore.getState().reset();
    });

    // Incrementally update the file index on add/unlink events.
    const unsubFiles = getFilesClient().subscribe((evt) => {
      const idx = useFileIndexStore.getState();
      if (!idx.initialized) return;
      if (evt.event === 'add') idx.addFile(evt.path);
      else if (evt.event === 'unlink') idx.removeFile(evt.path);
    });

    return () => { unsubProject(); unsubFiles(); };
  }, []);

  const jumpToPanel = useJumpToPanel();

  useKeyboardShortcut([
    { key: 'b', meta: true, ctrl: true, handler: () => togglePanelByType('fileExplorer') },
    { key: 'k', meta: true, ctrl: true, handler: () => togglePanelByType('claude') },
    { key: 'e', meta: true, ctrl: true, handler: () => togglePanelByType('editor') },
    { key: 'p', meta: true, ctrl: true, handler: () => togglePanelByType('preview') },
    // Ctrl/Cmd+1..5 jumps keyboard focus to the Nth panel (fileExplorer, editor,
    // terminal, claude, preview) and uncollapses it if hidden.
    ...PANEL_JUMP_ORDER.map((panel, idx) => ({
      key: String(idx + 1),
      meta: true,
      ctrl: true,
      handler: () => jumpToPanel(panel),
    })),
  ]);

  const handleTabDropOnLeaf = useCallback((data: DragData, targetLeafId: string, zone: DropZone) => {
    if (!zone || zone === 'center') return; // center = move tab (future), for now ignore

    const direction: SplitDirection = (zone === 'top' || zone === 'bottom') ? 'vertical' : 'horizontal';
    const position: 'before' | 'after' = (zone === 'top' || zone === 'left') ? 'before' : 'after';
    const panelType = data.sourceType as PanelContentType;

    useSplitLayoutStore.getState().splitLeaf(targetLeafId, direction, panelType, position);
  }, []);

  const handleTabReorder = useCallback((sourceType: string, activeId: string, overId: string) => {
    if (sourceType === 'editor') {
      const tabs = useEditorStore.getState().tabs;
      const fromIndex = tabs.findIndex((t) => t.id === activeId);
      const toIndex = tabs.findIndex((t) => t.id === overId);
      if (fromIndex >= 0 && toIndex >= 0) {
        useEditorStore.getState().reorderTab(fromIndex, toIndex);
      }
    } else if (sourceType === 'claude') {
      const tabs = useClaudeStore.getState().tabs;
      const fromIndex = tabs.findIndex((t) => t.id === activeId);
      const toIndex = tabs.findIndex((t) => t.id === overId);
      if (fromIndex >= 0 && toIndex >= 0) {
        useClaudeStore.getState().reorderTab(fromIndex, toIndex);
      }
    }
  }, []);

  if (!mounted) {
    return <div className="h-screen w-screen bg-background" aria-hidden="true" />;
  }

  return (
    <ErrorBoundary scope="app-shell">
    <div className={cn(
      "flex h-screen flex-col overflow-hidden",
      !panelRounding && "no-panel-rounding",
      !liquidGlass && "no-liquid-glass",
    )}>
      <Header
        onOpenProjectPicker={() => setProjectPickerOpen(true)}
        onOpenLoginPrompt={() => setLoginPromptOpen(true)}
      />
      <div className="flex-1 overflow-hidden">
        {isDesktop ? (
          <DndProvider onTabReorder={handleTabReorder} onTabDropOnLeaf={handleTabDropOnLeaf}>
            <SplitLayoutRenderer node={root} />
          </DndProvider>
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
      <RecoveryModal />
      <RemoteAccessModalHost />
      <McpServersModalHost />
      <CommandPalette />
      <SearchOverlay />
      <ToastContainer />
    </div>
    </ErrorBoundary>
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
