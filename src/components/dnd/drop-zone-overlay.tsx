'use client';

import { cn } from '@/lib/utils';
import type { DropZone } from './dnd-provider';

interface DropZoneOverlayProps {
  activeZone: DropZone;
  visible: boolean;
}

export function DropZoneOverlay({ activeZone, visible }: DropZoneOverlayProps) {
  if (!visible || !activeZone) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      {/* Top zone */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-1/2 transition-opacity duration-150',
          activeZone === 'top' ? 'bg-sky-500/20 opacity-100' : 'opacity-0',
        )}
      />
      {/* Bottom zone */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 h-1/2 transition-opacity duration-150',
          activeZone === 'bottom' ? 'bg-sky-500/20 opacity-100' : 'opacity-0',
        )}
      />
      {/* Left zone */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 w-1/2 transition-opacity duration-150',
          activeZone === 'left' ? 'bg-sky-500/20 opacity-100' : 'opacity-0',
        )}
      />
      {/* Right zone */}
      <div
        className={cn(
          'absolute inset-y-0 right-0 w-1/2 transition-opacity duration-150',
          activeZone === 'right' ? 'bg-sky-500/20 opacity-100' : 'opacity-0',
        )}
      />
      {/* Center zone */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-150',
          activeZone === 'center' ? 'bg-sky-500/10 ring-2 ring-inset ring-sky-500/40 opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
