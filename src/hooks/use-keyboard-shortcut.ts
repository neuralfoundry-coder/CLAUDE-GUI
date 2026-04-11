'use client';

import { useEffect } from 'react';

/**
 * Whether we're running on macOS (or iOS). On Mac the primary modifier for
 * app shortcuts is the Command key; Ctrl is reserved for terminal control
 * characters (`Ctrl+C` SIGINT, `Ctrl+D` EOF, readline shortcuts, etc.).
 * On every other platform the primary modifier is Ctrl.
 *
 * Cached on first call so we don't re-read `navigator` repeatedly.
 */
let cachedIsMac: boolean | null = null;
export function isMacPlatform(): boolean {
  // Never cache during SSR — the cached `false` would stick even after
  // hydration on a real macOS client, silently breaking all Cmd shortcuts.
  if (typeof navigator === 'undefined') return false;
  if (cachedIsMac !== null) return cachedIsMac;
  // `navigator.platform` is deprecated but still reliable on all current
  // desktop browsers. Fall back to userAgent for good measure.
  const platform = (navigator as Navigator).platform ?? '';
  const ua = navigator.userAgent ?? '';
  cachedIsMac = /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac|iPhone|iPad|iPod/i.test(ua);
  return cachedIsMac;
}

/**
 * True when the event carries the platform's primary modifier — Cmd on
 * macOS, Ctrl elsewhere. This is what app shortcuts (`Cmd/Ctrl+T`, etc.)
 * should test against instead of `metaKey || ctrlKey`, because on Mac the
 * latter would incorrectly claim shell control characters.
 */
export function hasPrimaryModifier(event: KeyboardEvent): boolean {
  return isMacPlatform() ? event.metaKey : event.ctrlKey;
}

export interface Shortcut {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (event: KeyboardEvent) => void;
  preventDefault?: boolean;
  /**
   * Optional gate that must return true for the shortcut to fire. Runs
   * after key matching but before the handler. Useful for focus-scoped
   * shortcuts (e.g. only when the terminal panel has focus).
   */
  when?: () => boolean;
}

function matches(event: KeyboardEvent, s: Shortcut): boolean {
  if (event.key.toLowerCase() !== s.key.toLowerCase()) return false;
  const needsMod = s.meta || s.ctrl;
  // We accept either `Cmd` or `Ctrl` for "primary modifier" shortcuts
  // across platforms. Readline shortcut conflicts on macOS (e.g.
  // `Ctrl+D` / `Ctrl+T`) are resolved at the xterm layer instead: the
  // terminal manager's reserved-key predicate is platform-aware (see
  // `setReservedKeyPredicate` and `isMacPlatform`), so xterm only vetoes
  // the PLATFORM primary modifier and lets raw Ctrl-chars flow into
  // the shell on macOS.
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
        if (!matches(event, s)) continue;
        if (s.when && !s.when()) continue;
        if (s.preventDefault ?? true) event.preventDefault();
        s.handler(event);
        return;
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [shortcuts]);
}

/**
 * Returns true if the user's focus is currently inside a terminal panel.
 * Relies on the `data-terminal-panel="true"` attribute on the panel root.
 * xterm renders its input into a nested `<textarea>`, so `.closest()` walks
 * up through the panel wrapper correctly.
 */
export function isFocusInsideTerminal(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!el) return false;
  return Boolean(
    (el as Element).closest?.('[data-terminal-panel="true"]'),
  );
}
