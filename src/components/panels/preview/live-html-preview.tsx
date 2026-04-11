'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Code, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLivePreviewStore } from '@/stores/use-live-preview-store';

export function LiveHtmlPreview() {
  const mode = useLivePreviewStore((s) => s.mode);
  const buffer = useLivePreviewStore((s) => s.buffer);
  const [userSource, setUserSource] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Debounce buffer → iframe srcdoc to avoid churn during rapid chunks.
  const [debouncedBuffer, setDebouncedBuffer] = useState(buffer);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedBuffer(buffer), 150);
    return () => window.clearTimeout(id);
  }, [buffer]);

  const showSource = userSource || mode === 'live-code';

  const statusLabel = useMemo(() => {
    if (mode === 'live-html') return 'Rendered';
    if (mode === 'live-code') return 'Source (streaming)';
    return 'Idle';
  }, [mode]);

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
      <div className="flex-1 overflow-hidden">
        {showSource ? (
          <pre className="h-full overflow-auto bg-background p-3 text-xs font-mono">
            {buffer || '(waiting for content…)'}
          </pre>
        ) : (
          <iframe
            ref={iframeRef}
            srcDoc={debouncedBuffer}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            title="Live HTML preview"
            className="h-full w-full border-0 bg-white"
          />
        )}
      </div>
    </div>
  );
}
