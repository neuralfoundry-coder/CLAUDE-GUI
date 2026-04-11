'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { filesApi } from '@/lib/api-client';
import { useEditorStore } from '@/stores/use-editor-store';
import { useLivePreviewStore } from '@/stores/use-live-preview-store';
import { usePreviewStore, detectPreviewType, type PreviewType } from '@/stores/use-preview-store';
import {
  previewDownloadOptions,
  downloadPreview,
  type ExportFormat,
} from '@/lib/preview/preview-download';

const INLINE_TYPES: ReadonlySet<PreviewType> = new Set(['html', 'markdown', 'slides']);

interface ResolvedInput {
  filePath: string;
  type: Exclude<PreviewType, 'none'>;
  /** Content already in memory (editor tab or live buffer). Empty for file-backed types. */
  inMemoryContent: string;
  /** Whether a content fetch is needed when `inMemoryContent` is empty. */
  needsFetch: boolean;
  /** True while a live stream is backing this download (prevents disk fetch). */
  fromLive: boolean;
}

export function PreviewDownloadMenu() {
  const currentFile = usePreviewStore((s) => s.currentFile);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === activeTabId));

  const liveMode = useLivePreviewStore((s) => s.mode);
  const liveBuffer = useLivePreviewStore((s) => s.buffer);
  const liveAutoSwitch = useLivePreviewStore((s) => s.autoSwitch);
  const generatedFilePath = useLivePreviewStore((s) => s.generatedFilePath);
  const showingLive = liveAutoSwitch && liveMode !== 'idle';

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-preview-download-menu]')) setOpen(false);
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [open]);

  const resolved = useMemo<ResolvedInput | null>(() => {
    if (showingLive) {
      // Live-buffer download: whatever has streamed so far is downloadable as
      // an inline HTML artifact. If the generated file is already open in the
      // editor, the editor tab wins (keeps keystrokes in sync). Otherwise fall
      // back to the raw stream buffer. `live-code` chunks are kept as-is —
      // users can still export the source fragment.
      const livePath = generatedFilePath ?? 'live-preview.html';
      const editorLiveTab =
        generatedFilePath != null
          ? useEditorStore.getState().tabs.find((t) => t.path === generatedFilePath)
          : undefined;
      const content = editorLiveTab?.content ?? liveBuffer;
      if (!content) return null;
      return {
        filePath: livePath,
        type: 'html',
        inMemoryContent: content,
        needsFetch: false,
        fromLive: true,
      };
    }
    const filePath = currentFile ?? activeTab?.path ?? null;
    const type = detectPreviewType(filePath);
    if (!filePath || type === 'none') return null;
    // SVG is served as an image file but we want the text body to enable
    // PNG conversion, so we treat it as an inline type for content lookup.
    const inlineNeeded =
      INLINE_TYPES.has(type) ||
      (type === 'image' && filePath.toLowerCase().endsWith('.svg'));
    const inMemory =
      activeTab && activeTab.path === filePath && inlineNeeded ? activeTab.content : '';
    return {
      filePath,
      type,
      inMemoryContent: inMemory,
      needsFetch: inlineNeeded && !inMemory,
      fromLive: false,
    };
  }, [showingLive, generatedFilePath, liveBuffer, currentFile, activeTab]);

  const options = useMemo(() => {
    if (!resolved) return [];
    return previewDownloadOptions({
      filePath: resolved.filePath,
      type: resolved.type,
      content: resolved.inMemoryContent,
    });
  }, [resolved]);

  if (!resolved || options.length === 0) return null;

  async function resolveContent(input: ResolvedInput): Promise<string> {
    if (input.inMemoryContent) return input.inMemoryContent;
    if (!input.needsFetch || input.fromLive) return '';
    try {
      const { content } = await filesApi.read(input.filePath);
      return content;
    } catch {
      return '';
    }
  }

  async function onPick(format: ExportFormat) {
    if (!resolved) return;
    setOpen(false);
    setBusy(true);
    try {
      const content = await resolveContent(resolved);
      downloadPreview(
        { filePath: resolved.filePath, type: resolved.type, content },
        format,
      );
    } finally {
      setBusy(false);
    }
  }

  const streamingBadge = resolved.fromLive && liveMode === 'live-code';

  return (
    <div className="relative" data-preview-download-menu>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Download preview"
        title={
          resolved.fromLive
            ? 'Download live preview (current buffer)'
            : 'Download preview'
        }
      >
        <Download className="h-3 w-3" aria-hidden="true" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[220px] rounded-md border bg-popover p-1 shadow-lg">
          <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">
            {resolved.fromLive
              ? streamingBadge
                ? 'Download (streaming…)'
                : 'Download live buffer'
              : 'Download as'}
          </div>
          {options.map((opt) => (
            <button
              key={opt.format}
              type="button"
              className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
              onClick={() => {
                void onPick(opt.format);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
