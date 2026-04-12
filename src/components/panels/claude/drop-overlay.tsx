'use client';

import { Upload } from 'lucide-react';

interface DropOverlayProps {
  visible: boolean;
}

export function DropOverlay({ visible }: DropOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 rounded-md bg-primary/10 ring-2 ring-inset ring-primary"
      role="status"
      aria-live="polite"
    >
      <Upload className="h-8 w-8 text-primary" aria-hidden="true" />
      <p className="text-sm font-medium text-primary">
        파일을 드롭하여 첨부
      </p>
    </div>
  );
}
