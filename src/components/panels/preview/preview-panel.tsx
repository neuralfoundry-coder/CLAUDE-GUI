'use client';

import { useEffect } from 'react';
import { Code, Eye, Maximize2, Minimize2, Pencil, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  usePreviewStore,
  detectPreviewType,
  isSourceToggleable,
} from '@/stores/use-preview-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { useLivePreviewStore } from '@/stores/use-live-preview-store';
import { PreviewRouter } from './preview-router';
import { LiveStreamPreview } from './live-stream-preview';
import { PreviewDownloadMenu } from './preview-download-menu';
import { cn } from '@/lib/utils';
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis';
import { extractPreviewText } from '@/lib/preview/extract-preview-text';

export function PreviewPanel() {
  const currentFile = usePreviewStore((s) => s.currentFile);
  const fullscreen = usePreviewStore((s) => s.fullscreen);
  const toggleFullscreen = usePreviewStore((s) => s.toggleFullscreen);
  const setFullscreen = usePreviewStore((s) => s.setFullscreen);
  const viewMode = usePreviewStore((s) => s.viewMode);
  const toggleViewMode = usePreviewStore((s) => s.toggleViewMode);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === activeTabId));
  const slideEditMode = usePreviewStore((s) => s.slideEditMode);
  const toggleSlideEditMode = usePreviewStore((s) => s.toggleSlideEditMode);
  const liveMode = useLivePreviewStore((s) => s.mode);
  const autoSwitch = useLivePreviewStore((s) => s.autoSwitch);
  const selectedSlideIndex = usePreviewStore((s) => s.selectedSlideIndex);
  const { supported: ttsSupported, speaking, speak, stop } = useSpeechSynthesis();

  // Keep in sync with PreviewRouter: prefer the active editor tab when it
  // is previewable so toolbar buttons (source toggle, TTS, etc.) match the
  // content being rendered.
  const activeTabPreviewable =
    activeTab && detectPreviewType(activeTab.path) !== 'none';
  const path = activeTabPreviewable
    ? activeTab.path
    : currentFile ?? activeTab?.path ?? null;
  const type = detectPreviewType(path);
  const showLive = autoSwitch && liveMode !== 'idle';
  const showSourceToggle = !showLive && isSourceToggleable(type);
  const showSlideEdit = !showLive && type === 'slides' && viewMode !== 'source';
  const TTS_TYPES = new Set(['html', 'markdown', 'slides'] as const);
  const showTts = !showLive && TTS_TYPES.has(type as 'html' | 'markdown' | 'slides') && ttsSupported;
  const typeLabel = showLive ? 'live' : type !== 'none' ? type : '';
  const headerLabel = showSourceToggle && viewMode === 'source'
    ? `${typeLabel} · source`
    : slideEditMode && type === 'slides'
      ? `${typeLabel} · edit`
      : typeLabel;

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, setFullscreen]);

  // Stop TTS when the previewed file changes
  useEffect(() => { stop(); }, [path, stop]);

  function handleTtsToggle() {
    if (speaking) { stop(); return; }
    const raw = activeTab?.content;
    if (!raw) return;
    const text = extractPreviewText(
      type,
      raw,
      type === 'slides' ? selectedSlideIndex : undefined,
    );
    if (text.trim()) speak(text);
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col border-l bg-background',
        fullscreen && 'fixed inset-0 z-[9999] border-l-0',
      )}
    >
      <div className="flex h-7 items-center justify-between border-b bg-muted px-3">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Preview</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground">{headerLabel}</span>
          {showTts && (
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-5 w-5', speaking && 'bg-accent')}
              onClick={handleTtsToggle}
              aria-label={speaking ? 'Stop reading' : 'Read aloud'}
              title={speaking ? 'Stop reading' : 'Read aloud'}
            >
              {speaking ? (
                <VolumeX className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Volume2 className="h-3 w-3" aria-hidden="true" />
              )}
            </Button>
          )}
          {showSlideEdit && (
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-5 w-5', slideEditMode && 'bg-accent')}
              onClick={toggleSlideEditMode}
              aria-label={slideEditMode ? 'Exit edit mode' : 'Edit slides'}
              title={slideEditMode ? 'Exit edit mode' : 'Edit slides'}
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
            </Button>
          )}
          {showSourceToggle && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={toggleViewMode}
              aria-label={viewMode === 'source' ? 'Show rendered' : 'Show source'}
              title={viewMode === 'source' ? 'Show rendered' : 'Show source'}
            >
              {viewMode === 'source' ? (
                <Eye className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Code className="h-3 w-3" aria-hidden="true" />
              )}
            </Button>
          )}
          <PreviewDownloadMenu />
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          >
            {fullscreen ? (
              <Minimize2 className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3 w-3" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">{showLive ? <LiveStreamPreview /> : <PreviewRouter />}</div>
    </div>
  );
}
