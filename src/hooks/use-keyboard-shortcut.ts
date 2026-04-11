'use client';

import { useEffect } from 'react';

export interface Shortcut {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (event: KeyboardEvent) => void;
  preventDefault?: boolean;
}

function matches(event: KeyboardEvent, s: Shortcut): boolean {
  if (event.key.toLowerCase() !== s.key.toLowerCase()) return false;
  const needsMod = s.meta || s.ctrl;
  if (needsMod && !(event.metaKey || event.ctrlKey)) return false;
  if (!needsMod && (event.metaKey || event.ctrlKey)) return false;
  if (s.shift !== undefined && event.shiftKey !== s.shift) return false;
  if (s.alt !== undefined && event.altKey !== s.alt) return false;
  return true;
}

export function useKeyboardShortcut(shortcuts: Shortcut[]): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      for (const s of shortcuts) {
        if (matches(event, s)) {
          if (s.preventDefault ?? true) event.preventDefault();
          s.handler(event);
          return;
        }
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [shortcuts]);
}
