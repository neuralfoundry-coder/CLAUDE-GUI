'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { filesApi } from '@/lib/api-client';

import { usePreviewStore, detectPreviewType } from '@/stores/use-preview-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { HtmlPreview } from './html-preview';
import { HtmlEditor } from './html-editor';
import { MarkdownPreview } from './markdown-preview';
import { MarkdownEditor } from './markdown-editor';
import { ImagePreview } from './image-preview';
import { PdfPreview } from './pdf-preview';
import { SlidePreview } from './slide-preview';
import { DocxPreview } from './docx-preview';
import { XlsxPreview } from './xlsx-preview';
import { PptxPreview } from './pptx-preview';
import { SourcePreview } from './source-preview';

export function PreviewRouter() {
  const currentFile = usePreviewStore((s) => s.currentFile);
  const viewMode = usePreviewStore((s) => s.viewMode);
  const editMode = usePreviewStore((s) => s.editMode);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === activeTabId));
  const updateTabContent = useEditorStore((s) => s.updateContent);
  const [content, setContent] = useState<string>('');
  // Monotonic counter to force content refresh even when the string is identical.
  const [contentKey, setContentKey] = useState(0);
  const prevFileRef = useRef<string | null>(null);

  // Prefer the active editor tab when it is a previewable file so that
  // switching tabs in the editor always updates the preview.  Fall back to
  // the explicitly-set currentFile (from the file explorer) otherwise.
  const activeTabPreviewable =
    activeTab && detectPreviewType(activeTab.path) !== 'none';
  const filePath = activeTabPreviewable
    ? activeTab.path
    : currentFile ?? activeTab?.path ?? null;
  const type = detectPreviewType(filePath);

  // Bump contentKey when the user navigates back to a previously-viewed file
  // so that child components (especially iframes) re-apply the content.
  useEffect(() => {
    if (filePath !== prevFileRef.current) {
      prevFileRef.current = filePath;
      setContentKey((k) => k + 1);
    }
  }, [filePath]);

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      // Sync back to editor tab if open
      if (activeTab && filePath && activeTab.path === filePath) {
        updateTabContent(activeTab.id, newContent);
      }
      // Also persist to disk
      if (filePath) {
        filesApi.write(filePath, newContent).catch(() => {});
      }
    },
    [activeTab, filePath, updateTabContent],
  );

  // Primary content-loading effect: fetch from editor tab or disk.
  // Uses a cancellation flag so stale async fetches never overwrite fresh content.
  useEffect(() => {
    let cancelled = false;

    if (!filePath) {
      setContent('');
      return;
    }

    // Immediately sync from editor tab when open — no async needed.
    if (activeTab && activeTab.path === filePath) {
      setContent(activeTab.content);
      return;
    }

    // Reset content immediately on file switch to avoid showing stale content.
    setContent('');

    if (type === 'html' || type === 'markdown' || type === 'slides') {
      filesApi
        .read(filePath)
        .then(({ content: c }) => { if (!cancelled) setContent(c); })
        .catch(() => { if (!cancelled) setContent(''); });
    }

    return () => { cancelled = true; };
  }, [filePath, type, activeTab]);

  // Debounced editor-tab content sync: when the user edits a file in the
  // Monaco editor, reflect changes in the preview after a short delay.
  // Depends on activeTab?.content (value) instead of activeTab (reference)
  // to avoid re-running on unrelated editor-store updates.
  useEffect(() => {
    if (!activeTab || !filePath || activeTab.path !== filePath) return;
    const timer = setTimeout(() => setContent(activeTab.content), 300);
    return () => clearTimeout(timer);
  }, [activeTab?.content, filePath]);

  if (!filePath || type === 'none') {
    return <div className="h-full w-full" aria-hidden="true" />;
  }

  if (type === 'html') {
    if (viewMode === 'source') return <SourcePreview content={content} language="html" />;
    if (editMode && filePath) return <HtmlEditor content={content} filePath={filePath} onContentChange={handleContentChange} />;
    return <HtmlPreview key={`${filePath}:${contentKey}`} content={content} />;
  }
  if (type === 'markdown') {
    if (viewMode === 'source') return <SourcePreview content={content} language="markdown" />;
    if (editMode && filePath) return <MarkdownEditor content={content} filePath={filePath} onContentChange={handleContentChange} />;
    return <MarkdownPreview content={content} />;
  }
  if (type === 'slides') {
    return viewMode === 'source' ? (
      <SourcePreview content={content} language="html" />
    ) : (
      <SlidePreview content={content} onContentChange={handleContentChange} />
    );
  }
  if (type === 'image') return <ImagePreview path={filePath} />;
  if (type === 'pdf') return <PdfPreview path={filePath} />;
  if (type === 'docx') return <DocxPreview path={filePath} />;
  if (type === 'xlsx') return <XlsxPreview path={filePath} />;
  if (type === 'pptx') return <PptxPreview path={filePath} />;
  return null;
}
