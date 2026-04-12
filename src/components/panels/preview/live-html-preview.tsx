'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Code, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLivePreviewStore } from '@/stores/use-live-preview-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { wrapSrcdoc } from '@/lib/preview/srcdoc-shim';

export function LiveHtmlPreview() {
  const mode = useLivePreviewStore((s) => s.mode);
  const pages = useLivePreviewStore((s) => s.pages);
  const activePageIndex = useLivePreviewStore((s) => s.activePageIndex);
  const activePg = pages[activePageIndex];
  const buffer = activePg?.content ?? '';
  const generatedFilePath = useLivePreviewStore((s) => s.generatedFilePath);
  // When the user has opened the generated HTML file in the editor, the
  // editor buffer becomes the source of truth so live edits re-render.
  const editorContent = useEditorStore((s) => {
    if (!generatedFilePath) return null;
    const tab = s.tabs.find((t) => t.path === generatedFilePath);
    return tab ? tab.content : null;
  });
  const usingEditor = editorContent !== null;
  const source = usingEditor ? (editorContent as string) : buffer;

  const [userSource, setUserSource] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Debounce source → iframe srcdoc to avoid churn during rapid chunks or keystrokes.
  const [debouncedSource, setDebouncedSource] = useState(source);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSource(source), 150);
    return () => window.clearTimeout(id);
  }, [source]);

  const shimmedSource = useMemo(() => wrapSrcdoc(debouncedSource), [debouncedSource]);

  const isSourceOnly = activePg ? !activePg.renderable && !activePg.complete : false;
  const showSource = userSource || (!usingEditor && isSourceOnly);

  const statusLabel = useMemo(() => {
    if (usingEditor) return 'Editor';
    if (mode === 'streaming') return activePg?.renderable ? 'Rendered' : 'Source (streaming)';
    if (mode === 'complete') return 'Rendered';
    return 'Idle';
  }, [mode, usingEditor, activePg?.renderable]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-7 items-center justify-between border-b bg-muted px-3">
        <span className="text-[10px] uppercase text-muted-foreground">Live · {statusLabel}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => setUserSource((v) => !v)}
          aria-label={showSource ? 'Show rendered' : 'Show source'}
          title={showSource ? 'Show rendered' : 'Show source'}
        >
          {showSource ? (
            <Eye className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Code className="h-3 w-3" aria-hidden="true" />
          )}
        </Button>
      </div>
      <div className="flex-1 overflow-hidden bg-muted p-2">
        {showSource ? (
          <pre className="h-full overflow-auto bg-background p-3 text-xs font-mono shadow-sm ring-1 ring-border/70">
            {source || '(waiting for content…)'}
          </pre>
        ) : (
          <iframe
            ref={iframeRef}
            srcDoc={shimmedSource}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            title="Live HTML preview"
            className="h-full w-full border-0 bg-white shadow-sm ring-1 ring-border/70"
          />
        )}
      </div>
    </div>
  );
}
