'use client';

import { useLayoutStore } from '@/stores/use-layout-store';
import { useArtifactStore } from '@/stores/use-artifact-store';
import { useKeyboardShortcut } from './use-keyboard-shortcut';

export function useGlobalShortcuts(): void {
  const increaseFontSize = useLayoutStore((s) => s.increaseFontSize);
  const decreaseFontSize = useLayoutStore((s) => s.decreaseFontSize);
  const toggleArtifacts = useArtifactStore((s) => s.toggle);

  useKeyboardShortcut([
    { key: '=', meta: true, ctrl: true, handler: () => increaseFontSize() },
    { key: '+', meta: true, ctrl: true, handler: () => increaseFontSize() },
    { key: '-', meta: true, ctrl: true, handler: () => decreaseFontSize() },
    { key: 'a', meta: true, ctrl: true, shift: true, handler: () => toggleArtifacts() },
  ]);
}
