'use client';

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Code, Eye } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { useLivePreviewStore, type LivePage } from '@/stores/use-live-preview-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { PageNavBar } from './page-nav-bar';
import { SourcePreview } from './source-preview';

// ---- Per-kind renderers ----

function HtmlRenderer({ content }: { content: string }) {
  const [debounced, setDebounced] = useState(content);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(content), 150);
    return () => window.clearTimeout(id);
  }, [content]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={debounced}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      title="Live HTML preview"
      className="h-full w-full border-0 bg-white shadow-sm ring-1 ring-border/70"
    />
  );
}

function SvgRenderer({ content }: { content: string }) {
  const [debounced, setDebounced] = useState(content);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(content), 150);
    return () => window.clearTimeout(id);
  }, [content]);

  // Wrap SVG in a minimal HTML document for safe iframe rendering
  const doc = `<!DOCTYPE html><html><head><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff}</style></head><body>${debounced}</body></html>`;

  return (
    <iframe
      srcDoc={doc}
      sandbox=""
      referrerPolicy="no-referrer"
      title="Live SVG preview"
      className="h-full w-full border-0 bg-white shadow-sm ring-1 ring-border/70"
    />
  );
}

function SafeImg(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const onError = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none';
  }, []);
  return <img {...props} onError={onError} />;
}

function MarkdownRenderer({ content }: { content: string }) {
  const [debounced, setDebounced] = useState(content);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(content), 200);
    return () => window.clearTimeout(id);
  }, [content]);

  return (
    <div className="h-full overflow-auto bg-background p-4">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: SafeImg }}>
          {debounced}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function TextRenderer({ content }: { content: string }) {
  return (
    <pre className="h-full overflow-auto bg-background p-3 text-xs font-mono">
      {content || '(waiting for content...)'}
    </pre>
  );
}

// ---- Active page renderer ----

function ActivePageContent({ page }: { page: LivePage }) {
  // When the user has opened the generated file in the editor, prefer editor content
  const editorContent = useEditorStore((s) => {
    if (!page.filePath) return null;
    const tab = s.tabs.find((t) => t.path === page.filePath);
    return tab ? tab.content : null;
  });
  const content = editorContent ?? page.content;

  if (page.viewMode === 'source') {
    const langMap: Record<string, string> = {
      html: 'html',
      svg: 'xml',
      markdown: 'markdown',
      code: page.language || 'plaintext',
      text: 'plaintext',
    };
    return <SourcePreview content={content} language={langMap[page.kind] ?? page.language} />;
  }

  // Rendered mode
  switch (page.kind) {
    case 'html':
      return <HtmlRenderer content={content} />;
    case 'svg':
      return <SvgRenderer content={content} />;
    case 'markdown':
      return <MarkdownRenderer content={content} />;
    case 'code':
      return <SourcePreview content={content} language={page.language || 'plaintext'} />;
    case 'text':
    default:
      return <TextRenderer content={content} />;
  }
}

// ---- Main component ----

export function LiveStreamPreview() {
  const mode = useLivePreviewStore((s) => s.mode);
  const pages = useLivePreviewStore((s) => s.pages);
  const activePageIndex = useLivePreviewStore((s) => s.activePageIndex);
  const togglePageViewMode = useLivePreviewStore((s) => s.togglePageViewMode);

  const activePage = pages[activePageIndex];

  if (!activePage) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Waiting for content...
      </div>
    );
  }

  const isSourceView = activePage.viewMode === 'source';
  const statusLabel =
    mode === 'streaming'
      ? activePage.renderable
        ? 'Streaming (rendered)'
        : 'Streaming (source)'
      : activePage.complete
        ? 'Complete'
        : 'Idle';

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex h-7 items-center justify-between border-b bg-muted px-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground">
            Live · {statusLabel}
          </span>
          {!activePage.complete && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => togglePageViewMode(activePage.id)}
          aria-label={isSourceView ? 'Show rendered' : 'Show source'}
          title={isSourceView ? 'Show rendered' : 'Show source'}
        >
          {isSourceView ? (
            <Eye className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Code className="h-3 w-3" aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* Page navigation (only if multiple pages) */}
      <PageNavBar />

      {/* Content area */}
      <div className="flex-1 overflow-hidden bg-muted p-2">
        <ActivePageContent page={activePage} />
      </div>
    </div>
  );
}
