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
import { CommandPalette } from '@/components/command-palette/command-palette';
import { MobileShell } from './mobile-shell';
import { SplitLayoutRenderer } from './split-layout-renderer';
import { useSettingsStore } from '@/stores/use-settings-store';
import { useRemoteAccessStore } from '@/stores/use-remote-access-store';
import { useMcpStore } from '@/stores/use-mcp-store';
import { useProjectStore } from '@/stores/use-project-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { useClaudeStore } from '@/stores/use-claude-store';
import { usePreviewStore } from '@/stores/use-preview-store';
import { useSplitLayoutStore } from '@/stores/use-split-layout-store';
import { useTheme } from '@/hooks/use-theme';
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { useMediaQuery } from '@/hooks/use-media-query';
import { getClaudeClient } from '@/lib/websocket/claude-client';
import { getFilesClient } from '@/lib/websocket/files-client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { DndProvider, type DragData, type DropZone } from '@/components/dnd/dnd-provider';
import type { SplitDirection, PanelContentType } from '@/stores/use-split-layout-store';

export function AppShell() {
  useTheme();
  useGlobalShortcuts();
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

  useEffect(() => {
    // Boot shared WebSocket clients so connection status updates early.
    getClaudeClient();
    getFilesClient().start();
    void useProjectStore.getState().refresh();

    const unsubscribe = getFilesClient().subscribeProjectChange((evt) => {
      useProjectStore.getState().applyRemoteChange(evt.root);
      useEditorStore.getState().resetAll();
      usePreviewStore.getState().setFile(null);
    });
    return unsubscribe;
  }, []);

  useKeyboardShortcut([
    { key: 'b', meta: true, ctrl: true, handler: () => togglePanelByType('fileExplorer') },
    { key: 'k', meta: true, ctrl: true, handler: () => togglePanelByType('claude') },
    { key: 'e', meta: true, ctrl: true, handler: () => togglePanelByType('editor') },
    { key: 'p', meta: true, ctrl: true, handler: () => togglePanelByType('preview') },
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

  return (
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
