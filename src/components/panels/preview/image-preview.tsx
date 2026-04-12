'use client';

import { useEffect, useMemo } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { usePreviewStore } from '@/stores/use-preview-store';

interface ImagePreviewProps {
  path: string;
}

export function ImagePreview({ path }: ImagePreviewProps) {
  const src = `/api/files/raw?path=${encodeURIComponent(path)}`;

  // Publish rendered HTML for cross-format export (PDF via print).
  // SVG images are handled separately by the inline/source pipeline.
  const isSvg = path.toLowerCase().endsWith('.svg');
  const setRenderedHtml = usePreviewStore((s) => s.setRenderedHtml);
  const renderedHtml = useMemo(() => {
    if (isSvg) return null; // SVG has its own export path
    return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f4f4f5; }
    img { max-width: 100%; max-height: 100vh; object-fit: contain; }
    @media print { body { background: #fff; } img { max-height: none; } }
  </style></head><body><img src="${src}" alt="${path.split('/').pop() ?? 'image'}"></body></html>`;
  }, [isSvg, src, path]);

  useEffect(() => {
    setRenderedHtml(renderedHtml);
    return () => setRenderedHtml(null);
  }, [renderedHtml, setRenderedHtml]);

  return (
    <div className="h-full w-full overflow-hidden bg-muted">
      <TransformWrapper initialScale={1} minScale={0.1} maxScale={10}>
        <TransformComponent wrapperClass="h-full w-full" contentClass="h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={path} className="mx-auto max-h-full max-w-full object-contain" />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
