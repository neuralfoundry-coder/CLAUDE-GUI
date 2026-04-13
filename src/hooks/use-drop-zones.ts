'use client';

import { useRef, useCallback } from 'react';
import type { DropZone } from '@/components/dnd/dnd-provider';

/**
 * Computes which drop zone a pointer is in based on position within an element.
 *
 *   ┌──────────────────────┐
 *   │         TOP          │  ← top 25%
 *   ├────┬────────────┬────┤
 *   │ L  │   CENTER   │ R  │  ← left/right 25%, center 50%
 *   ├────┴────────────┴────┤
 *   │        BOTTOM        │  ← bottom 25%
 *   └──────────────────────┘
 */
export function computeDropZone(
  rect: DOMRect,
  clientX: number,
  clientY: number,
): DropZone {
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;
  const percX = relX / rect.width;
  const percY = relY / rect.height;

  const edgeThreshold = 0.25;

  if (percY < edgeThreshold) return 'top';
  if (percY > 1 - edgeThreshold) return 'bottom';
  if (percX < edgeThreshold) return 'left';
  if (percX > 1 - edgeThreshold) return 'right';
  return 'center';
}

export function useDropZoneRef() {
  const ref = useRef<HTMLDivElement>(null);

  const getZone = useCallback((clientX: number, clientY: number): DropZone => {
    if (!ref.current) return null;
    const rect = ref.current.getBoundingClientRect();
    return computeDropZone(rect, clientX, clientY);
  }, []);

  return { ref, getZone };
}
