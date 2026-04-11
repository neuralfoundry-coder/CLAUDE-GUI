'use client';

import { useEffect, useRef } from 'react';

interface HtmlPreviewProps {
  content: string;
}

export function HtmlPreview({ content }: HtmlPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Debounced via parent
  }, [content]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={content}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="h-full w-full border-0 bg-white"
      title="HTML preview"
    />
  );
}
