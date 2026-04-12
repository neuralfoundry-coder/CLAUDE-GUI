'use client';

import { useCallback } from 'react';
import { useLayoutStore, type PanelId } from '@/stores/use-layout-store';

/**
 * Returns a stable onMouseDown handler that sets the focused panel in the
 * layout store.  Attach it to each panel's root container so that clicking
 * anywhere inside the panel marks it as focused — enabling per-panel keyboard
 * shortcuts (zoom in/out) to target the correct panel.
 */
export function usePanelFocus(panelId: PanelId): {
  onMouseDown: () => void;
  onFocus: () => void;
} {
  const setFocusedPanel = useLayoutStore((s) => s.setFocusedPanel);
  const handler = useCallback(() => setFocusedPanel(panelId), [panelId, setFocusedPanel]);
  return { onMouseDown: handler, onFocus: handler };
}
