'use client';

import { useLayoutStore } from '@/stores/use-layout-store';
import { useArtifactStore } from '@/stores/use-artifact-store';
import { useProjectStore } from '@/stores/use-project-store';
import { terminalApi } from '@/lib/api-client';
import { useKeyboardShortcut } from './use-keyboard-shortcut';

export function useGlobalShortcuts(): void {
  const increaseFontSize = useLayoutStore((s) => s.increaseFontSize);
  const decreaseFontSize = useLayoutStore((s) => s.decreaseFontSize);
  const increasePanelZoom = useLayoutStore((s) => s.increasePanelZoom);
  const decreasePanelZoom = useLayoutStore((s) => s.decreasePanelZoom);
  const resetPanelZoom = useLayoutStore((s) => s.resetPanelZoom);
  const toggleArtifacts = useArtifactStore((s) => s.toggle);

  useKeyboardShortcut([
    { key: '=', meta: true, ctrl: true, handler: () => increaseFontSize() },
    { key: '+', meta: true, ctrl: true, handler: () => increaseFontSize() },
    { key: '-', meta: true, ctrl: true, handler: () => decreaseFontSize() },

    // ── Per-panel zoom (Cmd/Ctrl + =/- without shift) ──
    {
      key: '=',
      meta: true,
      ctrl: true,
      shift: true,
      handler: () => {
        const panel = useLayoutStore.getState().focusedPanel;
        if (panel) increasePanelZoom(panel);
      },
    },
    {
      key: '+',
      meta: true,
      ctrl: true,
      shift: true,
      handler: () => {
        const panel = useLayoutStore.getState().focusedPanel;
        if (panel) increasePanelZoom(panel);
      },
    },
    {
      key: '-',
      meta: true,
      ctrl: true,
      shift: true,
      handler: () => {
        const panel = useLayoutStore.getState().focusedPanel;
        if (panel) decreasePanelZoom(panel);
      },
    },
    {
      key: '0',
      meta: true,
      ctrl: true,
      shift: true,
      handler: () => {
        const panel = useLayoutStore.getState().focusedPanel;
        if (panel) resetPanelZoom(panel);
      },
    },
    { key: 'a', meta: true, ctrl: true, shift: true, handler: () => toggleArtifacts() },

    // Cmd/Ctrl+Shift+O — open the project root in the OS terminal app.
    {
      key: 'o',
      meta: true,
      ctrl: true,
      shift: true,
      handler: () => {
        const cwd = useProjectStore.getState().activeRoot ?? undefined;
        void terminalApi.openNative(cwd).catch(() => {
          /* ignore — OS will show its own error */
        });
      },
    },
  ]);
}
