'use client';

import { useEffect, useMemo, useRef } from 'react';
import { wrapSrcdoc } from '@/lib/preview/srcdoc-shim';

interface HtmlPreviewProps {
  content: string;
}

export function HtmlPreview({ content }: HtmlPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const shimmed = useMemo(() => wrapSrcdoc(content), [content]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    // Explicitly write content to the iframe document to ensure it
    // always reflects the latest content — relying solely on the srcDoc
    // attribute can fail when React skips the DOM update because the
    // prop value is referentially identical to the previous render.
    iframe.srcdoc = shimmed;
  }, [shimmed]);

  return (
    <div className="h-full w-full bg-muted p-2">
      <iframe
        ref={iframeRef}
        srcDoc={shimmed}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="h-full w-full border-0 bg-white shadow-sm ring-1 ring-border/70"
        title="HTML preview"
      />
    </div>
  );
}
