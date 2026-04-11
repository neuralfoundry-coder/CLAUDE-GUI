'use client';

import { useEffect, useState } from 'react';
import { filesApi } from '@/lib/api-client';
import { debounce } from '@/lib/utils';
import { usePreviewStore, detectPreviewType } from '@/stores/use-preview-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { HtmlPreview } from './html-preview';
import { MarkdownPreview } from './markdown-preview';
import { ImagePreview } from './image-preview';
import { PdfPreview } from './pdf-preview';
import { SlidePreview } from './slide-preview';

export function PreviewRouter() {
  const currentFile = usePreviewStore((s) => s.currentFile);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === activeTabId));
  const [content, setContent] = useState<string>('');

  const filePath = currentFile ?? activeTab?.path ?? null;
  const type = detectPreviewType(filePath);

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
    const update = debounce((c: string) => setContent(c), 300);
    update(activeTab.content);
  }, [activeTab, filePath]);

  if (!filePath || type === 'none') {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Select a previewable file (HTML, Markdown, PDF, image, slides)
      </div>
    );
  }

  if (type === 'html') return <HtmlPreview content={content} />;
  if (type === 'markdown') return <MarkdownPreview content={content} />;
  if (type === 'image') return <ImagePreview path={filePath} />;
  if (type === 'pdf') return <PdfPreview path={filePath} />;
  if (type === 'slides') return <SlidePreview content={content} />;
  return null;
}
