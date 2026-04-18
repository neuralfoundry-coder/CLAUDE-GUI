import { UniversalStreamExtractor } from '@/lib/claude/universal-stream-extractor';
import { useLivePreviewStore } from '@/stores/use-live-preview-store';
import type { StreamingToolInput } from './types';

/** Per-tab extractor: one UniversalStreamExtractor per Claude tab. */
const perTabExtractors = new Map<string, UniversalStreamExtractor>();

/** Per-tab streaming tool-input accumulator keyed by block index. */
const perTabStreamingToolInputs = new Map<string, Map<number, StreamingToolInput>>();

export async function fetchFileContent(filePath: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { content?: unknown }; content?: unknown };
    const content = json?.data?.content ?? json?.content;
    return typeof content === 'string' ? content : null;
  } catch {
    return null;
  }
}

export function getStreamingToolInputs(tabId: string): Map<number, StreamingToolInput> {
  let map = perTabStreamingToolInputs.get(tabId);
  if (!map) {
    map = new Map();
    perTabStreamingToolInputs.set(tabId, map);
  }
  return map;
}

export function ensureExtractor(tabId: string, streamId: string): UniversalStreamExtractor {
  const existing = perTabExtractors.get(tabId);
  if (existing) return existing;

  const live = useLivePreviewStore.getState();
  live.startStream(streamId);

  const extractor = new UniversalStreamExtractor({
    onPageStart: (page) => {
      useLivePreviewStore.getState().addPage(page);
    },
    onPageChunk: (pageId, content, renderable) => {
      useLivePreviewStore.getState().updatePageContent(pageId, content, renderable);
    },
    onPageComplete: (pageId, content) => {
      useLivePreviewStore.getState().completePage(pageId, content);
    },
    onWritePath: (_pageId, filePath) => {
      useLivePreviewStore.getState().setGeneratedFilePath(filePath);
    },
    onNeedBaseline: (filePath, apply) => {
      void fetchFileContent(filePath).then((content) => {
        if (content) apply(content);
      });
    },
  });

  const pages = useLivePreviewStore.getState().pages;
  for (const page of pages) {
    if (page.filePath && page.content) {
      extractor.seedBaseline(page.filePath, page.content);
    }
  }

  perTabExtractors.set(tabId, extractor);
  return extractor;
}

export function finalizeExtractor(tabId: string): void {
  const extractor = perTabExtractors.get(tabId);
  if (!extractor) return;
  extractor.finalize();
  perTabExtractors.delete(tabId);
  perTabStreamingToolInputs.delete(tabId);
  useLivePreviewStore.getState().finalize();
}

/**
 * Maps requestId → tabId so server responses can be routed to the tab that
 * originated the request, even before session_id is assigned. Entries are
 * added when setCurrentRequestId is called and removed on result/error or
 * when the tab is closed.
 */
export const requestToTabMap = new Map<string, string>();
