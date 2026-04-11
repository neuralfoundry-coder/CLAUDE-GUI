'use client';

import { useLayoutStore } from '@/stores/use-layout-store';
import { useKeyboardShortcut } from './use-keyboard-shortcut';

export function useGlobalShortcuts(): void {
  const increaseFontSize = useLayoutStore((s) => s.increaseFontSize);
  const decreaseFontSize = useLayoutStore((s) => s.decreaseFontSize);

  useKeyboardShortcut([
    { key: '=', meta: true, ctrl: true, handler: () => increaseFontSize() },
    { key: '+', meta: true, ctrl: true, handler: () => increaseFontSize() },
    { key: '-', meta: true, ctrl: true, handler: () => decreaseFontSize() },
  ]);
}
