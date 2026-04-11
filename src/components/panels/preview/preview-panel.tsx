'use client';

import { useEffect } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreviewStore, detectPreviewType } from '@/stores/use-preview-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { useLivePreviewStore } from '@/stores/use-live-preview-store';
import { PreviewRouter } from './preview-router';
import { LiveHtmlPreview } from './live-html-preview';
import { PreviewDownloadMenu } from './preview-download-menu';
import { cn } from '@/lib/utils';

export function PreviewPanel() {
  const currentFile = usePreviewStore((s) => s.currentFile);
  const fullscreen = usePreviewStore((s) => s.fullscreen);
  const toggleFullscreen = usePreviewStore((s) => s.toggleFullscreen);
  const setFullscreen = usePreviewStore((s) => s.setFullscreen);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === activeTabId));
  const liveMode = useLivePreviewStore((s) => s.mode);
  const autoSwitch = useLivePreviewStore((s) => s.autoSwitch);

  const path = currentFile ?? activeTab?.path ?? null;
  const type = detectPreviewType(path);
  const showLive = autoSwitch && liveMode !== 'idle';

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, setFullscreen]);

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
          <span className="text-[10px] uppercase text-muted-foreground">
            {showLive ? 'live' : type !== 'none' ? type : ''}
          </span>
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
      <div className="flex-1 overflow-hidden">{showLive ? <LiveHtmlPreview /> : <PreviewRouter />}</div>
    </div>
  );
}
