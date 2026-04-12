'use client';

import { Minus, Plus } from 'lucide-react';
import { useLayoutStore, type PanelId } from '@/stores/use-layout-store';
import { cn } from '@/lib/utils';

interface PanelZoomControlsProps {
  panelId: PanelId;
  className?: string;
}

export function PanelZoomControls({ panelId, className }: PanelZoomControlsProps) {
  const zoom = useLayoutStore((s) => s.panelZoom[panelId]);
  const increase = useLayoutStore((s) => s.increasePanelZoom);
  const decrease = useLayoutStore((s) => s.decreasePanelZoom);
  const reset = useLayoutStore((s) => s.resetPanelZoom);

  const pct = Math.round(zoom * 100);
  const isDefault = pct === 100;

  return (
    <div
      className={cn('flex items-center gap-0.5', className)}
      // Prevent panel focus change when clicking zoom controls
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => decrease(panelId)}
        className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus className="h-2.5 w-2.5" />
      </button>
      <button
        type="button"
        onClick={() => reset(panelId)}
        className={cn(
          'min-w-[32px] px-0.5 text-center text-[9px] tabular-nums rounded transition-colors',
          isDefault
            ? 'text-muted-foreground/60'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        )}
        aria-label="Reset zoom"
        title="Reset zoom to 100%"
      >
        {pct}%
      </button>
      <button
        type="button"
        onClick={() => increase(panelId)}
        className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
