'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { filesApi } from '@/lib/api-client';

import { usePreviewStore, detectPreviewType } from '@/stores/use-preview-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { HtmlPreview } from './html-preview';
import { MarkdownPreview } from './markdown-preview';
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
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === activeTabId));
  const updateTabContent = useEditorStore((s) => s.updateContent);
  const [content, setContent] = useState<string>('');
  // Monotonic counter to force content refresh even when the string is identical.
  const [contentKey, setContentKey] = useState(0);
  const prevFileRef = useRef<string | null>(null);

  const filePath = currentFile ?? activeTab?.path ?? null;
  const type = detectPreviewType(filePath);

  // Bump contentKey when the user navigates back to a previously-viewed file
  // so that child components (especially iframes) re-apply the content.
  useEffect(() => {
    if (filePath !== prevFileRef.current) {
      prevFileRef.current = filePath;
      setContentKey((k) => k + 1);
    }
  }, [filePath]);

  const handleSlideContentChange = useCallback(
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

  useEffect(() => {
    if (!filePath) {
      setContent('');
      return;
    }
    if (activeTab && activeTab.path === filePath) {
      setContent(activeTab.content);
      return;
    }
    if (type === 'html' || type === 'markdown' || type === 'slides') {
      filesApi
        .read(filePath)
        .then(({ content: c }) => setContent(c))
        .catch(() => setContent(''));
    }
  }, [filePath, type, activeTab]);

  useEffect(() => {
    if (!activeTab || !filePath || activeTab.path !== filePath) return;
    const timer = setTimeout(() => setContent(activeTab.content), 300);
    return () => clearTimeout(timer);
  }, [activeTab, filePath]);

  if (!filePath || type === 'none') {
    return <div className="h-full w-full" aria-hidden="true" />;
  }

  if (type === 'html') {
    return viewMode === 'source' ? (
      <SourcePreview content={content} language="html" />
    ) : (
      <HtmlPreview key={`${filePath}:${contentKey}`} content={content} />
    );
  }
  if (type === 'markdown') {
    return viewMode === 'source' ? (
      <SourcePreview content={content} language="markdown" />
    ) : (
      <MarkdownPreview content={content} />
    );
  }
  if (type === 'slides') {
    return viewMode === 'source' ? (
      <SourcePreview content={content} language="html" />
    ) : (
      <SlidePreview content={content} onContentChange={handleSlideContentChange} />
    );
  }
  if (type === 'image') return <ImagePreview path={filePath} />;
  if (type === 'pdf') return <PdfPreview path={filePath} />;
  if (type === 'docx') return <DocxPreview path={filePath} />;
  if (type === 'xlsx') return <XlsxPreview path={filePath} />;
  if (type === 'pptx') return <PptxPreview path={filePath} />;
  return null;
}
