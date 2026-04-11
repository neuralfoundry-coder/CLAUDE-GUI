'use client';

import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface ImagePreviewProps {
  path: string;
}

export function ImagePreview({ path }: ImagePreviewProps) {
  const src = `/api/files/raw?path=${encodeURIComponent(path)}`;
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
