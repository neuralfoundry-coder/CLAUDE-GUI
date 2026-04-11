'use client';

import { useEffect, useRef } from 'react';

interface SlidePreviewProps {
  content: string;
}

export function SlidePreview({ content }: SlidePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const handleLoad = () => {
      iframe.contentWindow?.postMessage({ type: 'UPDATE_CONTENT', content }, '*');
    };
    iframe.addEventListener('load', handleLoad);
    iframe.contentWindow?.postMessage({ type: 'UPDATE_CONTENT', content }, '*');
    return () => iframe.removeEventListener('load', handleLoad);
  }, [content]);

  return (
    <div className="h-full w-full bg-muted p-2">
      <iframe
        ref={iframeRef}
        src="/reveal-host.html"
        sandbox="allow-scripts"
        className="h-full w-full border-0 bg-black shadow-sm ring-1 ring-border/70"
        title="Slide preview"
      />
    </div>
  );
}
