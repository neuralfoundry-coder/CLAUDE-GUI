'use client';

import { useCallback } from 'react';
import { useLayoutStore, type PanelId } from '@/stores/use-layout-store';
import { useSplitLayoutStore, type PanelContentType } from '@/stores/use-split-layout-store';

/**
 * `PanelId` and the split-layout's `PanelContentType` use identical string
 * literals, so we accept either at the boundary.
 */
type AnyPanelId = PanelId | PanelContentType;

/**
 * Focus a panel by its data-panel-id selector. Called after the panel is
 * uncollapsed so the DOM element exists and is focusable. If the panel root
 * is not natively focusable (no `tabIndex`), we install `tabIndex=-1` so
 * `focus()` actually takes effect — some panels (e.g. the editor panel) are
 * plain `<div>`s because they delegate keyboard handling to child widgets.
 */
function focusPanelElement(panel: AnyPanelId): void {
  if (typeof document === 'undefined') return;
  const attempt = () => {
    const el = document.querySelector<HTMLElement>(`[data-panel-id="${panel}"]`);
    if (!el) return false;
    if (!el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '-1');
    }
    el.focus({ preventScroll: false });
    return true;
  };
  if (!attempt()) {
    requestAnimationFrame(() => {
      attempt();
    });
  }
}

/**
 * Jump to a panel by id. Uncollapses it if collapsed, focuses its root element,
 * and marks it as the focused panel in the layout store.
 */
export function useJumpToPanel(): (panel: AnyPanelId) => void {
  const setFocusedPanel = useLayoutStore((s) => s.setFocusedPanel);

  return useCallback(
    (panel: AnyPanelId) => {
      const splitLayout = useSplitLayoutStore.getState();
      if (splitLayout.isPanelCollapsed(panel as PanelContentType)) {
        splitLayout.setPanelCollapsedByType(panel as PanelContentType, false);
      }
      setFocusedPanel(panel as PanelId);
      // Focus after uncollapse so the element exists in the DOM.
      focusPanelElement(panel);
    },
    [setFocusedPanel],
  );
}

/** Ordered list of panels addressed by number keys 1..5. */
export const PANEL_JUMP_ORDER: readonly PanelId[] = [
  'fileExplorer',
  'editor',
  'terminal',
  'claude',
  'preview',
] as const;
