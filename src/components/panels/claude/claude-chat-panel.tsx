'use client';

import { useState } from 'react';
import { History, FileStack } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClaudeStore } from '@/stores/use-claude-store';
import { useArtifactStore } from '@/stores/use-artifact-store';
import { getClaudeClient } from '@/lib/websocket/claude-client';
import { SessionList } from './session-list';
import { ModelSelector } from './model-selector';
import { SlidePreferencesDialog } from './slide-preferences-dialog';
import type { SlidePreferences } from '@/types/intent';
import { ClaudeTabBar } from './claude-tab-bar';
import { ClaudeChatView } from './claude-chat-view';
import { usePanelFocus } from '@/hooks/use-panel-focus';
import { PanelZoomControls } from '@/components/panels/panel-zoom-controls';

interface ClaudeChatPanelProps {
  leafId?: string;
}

export function ClaudeChatPanel({ leafId }: ClaudeChatPanelProps) {
  const [sessionListOpen, setSessionListOpen] = useState(false);
  const [showSlideDialog, setShowSlideDialog] = useState(false);
  const [pendingSlidePrompt, setPendingSlidePrompt] = useState<string | null>(null);

  const activeTabId = useClaudeStore((s) => s.activeTabId);
  const isStreaming = useClaudeStore((s) => s.isStreaming);
  const artifactCount = useArtifactStore((s) => s.artifacts.length);
  const openArtifacts = useArtifactStore((s) => s.open);

  const panelFocus = usePanelFocus('claude');

  const handleShowSlideDialog = (prompt: string) => {
    setPendingSlidePrompt(prompt);
    setShowSlideDialog(true);
  };

  const handleSlideSubmit = (preferences: SlidePreferences) => {
    if (!pendingSlidePrompt) return;
    getClaudeClient().sendQuery(pendingSlidePrompt, {
      type: 'slides',
      preferences: preferences as unknown as Record<string, unknown>,
    });
    setShowSlideDialog(false);
    setPendingSlidePrompt(null);
  };

  const handleSlideSkip = () => {
    if (!pendingSlidePrompt) return;
    getClaudeClient().sendQuery(pendingSlidePrompt, {
      type: 'slides',
      preferences: { purpose: '일반', textSize: 'medium', colorTone: 'deep-navy' },
    });
    setShowSlideDialog(false);
    setPendingSlidePrompt(null);
  };

  const handleSlideCancel = () => {
    if (pendingSlidePrompt) setPendingSlidePrompt(null);
    setShowSlideDialog(false);
  };

  return (
    <div
      className={`relative flex h-full flex-col panel-container panel-container-restore-border-l bg-background${isStreaming ? ' claude-streaming' : ''}`}
      data-panel-id="claude"
      onMouseDown={panelFocus.onMouseDown}
      onFocus={panelFocus.onFocus}
    >
      {/* Header */}
      <div className="flex h-7 items-center justify-between border-b glass-surface glass-highlight relative px-2">
        <div className="flex items-center gap-1.5">
          {isStreaming && (
            <span className="claude-status-dot h-1.5 w-1.5 rounded-full bg-primary" />
          )}
          <span className="text-xs font-semibold uppercase text-muted-foreground">Claude</span>
          <ModelSelector />
        </div>
        <div className="flex items-center gap-0.5">
          <PanelZoomControls panelId="claude" />
          <Button
            variant="ghost"
            size="icon"
            className="relative h-6 w-6"
            onClick={() => openArtifacts()}
            title="Generated content"
            aria-label="Open generated content gallery"
          >
            <FileStack className="h-3 w-3" aria-hidden="true" />
            {artifactCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary px-1 text-[8px] font-semibold leading-none text-primary-foreground"
                aria-label={`${artifactCount} artifacts`}
              >
                {artifactCount > 99 ? '99+' : artifactCount}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setSessionListOpen(true)}
            title="Session history"
            aria-label="Open Claude session history"
          >
            <History className="h-3 w-3" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <ClaudeTabBar leafId={leafId} />

      {/* Chat content for active tab */}
      {activeTabId && (
        <ClaudeChatView
          key={activeTabId}
          tabId={activeTabId}
          onShowSlideDialog={handleShowSlideDialog}
        />
      )}

      {/* Dialogs */}
      <SessionList open={sessionListOpen} onOpenChange={setSessionListOpen} />

      <SlidePreferencesDialog
        open={showSlideDialog}
        onSubmit={handleSlideSubmit}
        onSkip={handleSlideSkip}
        onCancel={handleSlideCancel}
      />
    </div>
  );
}
