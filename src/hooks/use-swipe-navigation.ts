'use client';

import { useRef, useCallback, type RefCallback } from 'react';

interface SwipeNavigationOptions {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  threshold?: number;
}

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
}: SwipeNavigationOptions): RefCallback<HTMLElement> {
  const startX = useRef(0);
  const startY = useRef(0);

  const ref: RefCallback<HTMLElement> = useCallback(
    (node) => {
      if (!node) return;

      const handleTouchStart = (e: TouchEvent) => {
        const touch = e.touches[0];
        if (!touch) return;
        startX.current = touch.clientX;
        startY.current = touch.clientY;
      };

      const handleTouchEnd = (e: TouchEvent) => {
        const touch = e.changedTouches[0];
        if (!touch) return;
        const dx = touch.clientX - startX.current;
        const dy = touch.clientY - startY.current;

        // Only trigger if horizontal movement exceeds vertical (prevents conflicts with scrolling)
        if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return;

        if (dx < 0) onSwipeLeft();
        else onSwipeRight();
      };

      node.addEventListener('touchstart', handleTouchStart, { passive: true });
      node.addEventListener('touchend', handleTouchEnd, { passive: true });
    },
    [onSwipeLeft, onSwipeRight, threshold],
  );

  return ref;
}
