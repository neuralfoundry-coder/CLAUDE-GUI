'use client';

/**
 * Collection manager for terminal sessions. This is the only terminal module
 * that imports Zustand stores — it acts as the bridge between the UI layer
 * and the pure terminal logic in TerminalSessionController.
 *
 * Replaces the former `terminal-manager.ts` god object.
 */

import { TerminalSessionController, type SessionStatus } from './terminal-session-controller';
import { getXtermModules, type ReservedKeyPredicate, type FileLinkHandler } from './terminal-instance';
import { TERMINAL_THEMES, resolveTheme } from './terminal-themes';
import { useLayoutStore, type Theme as AppTheme } from '@/stores/use-layout-store';
import { useSettingsStore } from '@/stores/use-settings-store';
import { useConnectionStore } from '@/stores/use-connection-store';
import { getBrowserId } from '@/lib/browser-session';
import { isMacPlatform } from '@/hooks/use-keyboard-shortcut';

// Re-export types for consumers.
export type { SessionStatus } from './terminal-session-controller';
export type { ReservedKeyPredicate, FileLinkHandler } from './terminal-instance';
export type { ConnectionStatus } from './terminal-connection';

/** @deprecated Use `SessionStatus` instead. */
export type TerminalInstanceStatus = SessionStatus;

// ---------------------------------------------------------------------------
// Listener types
// ---------------------------------------------------------------------------

type SessionListener = (id: string, status: SessionStatus, exitCode: number | null) => void;
type CwdListener = (id: string, cwd: string | null) => void;
type ActivityListener = (id: string) => void;

// ---------------------------------------------------------------------------
// TerminalRegistry
// ---------------------------------------------------------------------------

class TerminalRegistry {
  private controllers = new Map<string, TerminalSessionController>();
  private listeners = new Set<SessionListener>();
  private cwdListeners = new Set<CwdListener>();
  private activityListeners = new Set<ActivityListener>();
  private layoutUnsub: (() => void) | null = null;
  private settingsUnsub: (() => void) | null = null;
  private systemThemeHandler: (() => void) | null = null;
  private booted = false;
  private _reservedKeyPredicate: ReservedKeyPredicate | null = null;
  private _fileLinkHandler: FileLinkHandler | null = null;

  // ── Boot / Dispose ────────────────────────────────────────────────────

  boot(): void {
    if (this.booted || typeof window === 'undefined') return;
    this.booted = true;

    const layout = useLayoutStore.getState();

    // Layout subscriptions: font size, theme, panel zoom.
    this.layoutUnsub = useLayoutStore.subscribe((state, prev) => {
      if (state.fontSize !== prev.fontSize || state.panelZoom.terminal !== prev.panelZoom.terminal) {
        const px = Math.round(state.fontSize * state.panelZoom.terminal);
        for (const c of this.controllers.values()) c.setFontSize(px);
      }
      if (state.theme !== prev.theme) {
        this.applyTheme(state.theme);
      }
    });

    // Settings subscriptions: font family.
    this.settingsUnsub = useSettingsStore.subscribe((state, prev) => {
      if (state.terminalFontFamily !== prev.terminalFontFamily) {
        const family = state.terminalFontFamily || 'JetBrains Mono, Menlo, monospace';
        for (const c of this.controllers.values()) c.setFontFamily(family);
      }
    });

    // OS theme change detection.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemThemeHandler = () => {
      if (useLayoutStore.getState().theme === 'system') this.applyTheme('system');
    };
    mq.addEventListener('change', this.systemThemeHandler);

    // Apply initial values.
    this.applyTheme(layout.theme);

    // Build reserved key predicate.
    this.buildReservedKeyPredicate();
  }

  dispose(): void {
    for (const id of Array.from(this.controllers.keys())) {
      this.closeSession(id);
    }
    this.layoutUnsub?.();
    this.layoutUnsub = null;
    this.settingsUnsub?.();
    this.settingsUnsub = null;
    this.booted = false;
  }

  // ── Public API ────────────────────────────────────────────────────────

  has(id: string): boolean {
    return this.controllers.has(id);
  }

  /** @deprecated Use `has()` instead. */
  hasSession(id: string): boolean {
    return this.controllers.has(id);
  }

  get(id: string): TerminalSessionController | undefined {
    return this.controllers.get(id);
  }

  async ensureSession(id: string, opts?: {
    initialCwd?: string;
    serverSessionId?: string;
  }): Promise<void> {
    if (typeof window === 'undefined') return;
    if (this.controllers.has(id)) return;

    // Load xterm modules lazily (first session triggers download).
    const modules = await getXtermModules();

    // Idempotency guard for concurrent callers.
    if (this.controllers.has(id)) return;

    const layout = useLayoutStore.getState();
    const settings = useSettingsStore.getState();
    const fontSize = Math.round(layout.fontSize * layout.panelZoom.terminal);
    const theme = TERMINAL_THEMES[resolveTheme(layout.theme)] ?? TERMINAL_THEMES.dark;
    const baseUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/terminal`;

    const controller = new TerminalSessionController(modules, {
      id,
      initialCwd: opts?.initialCwd ?? null,
      baseUrl,
      browserId: getBrowserId(),
      fontSize,
      fontFamily: settings.terminalFontFamily || 'JetBrains Mono, Menlo, monospace',
      theme,
      reservedKeyPredicate: this._reservedKeyPredicate,
      fileLinkHandler: this._fileLinkHandler,
      copyOnSelect: settings.terminalCopyOnSelect,
      onStatusChange: (status, exitCode) => {
        if (status === 'open') {
          useConnectionStore.getState().setStatus('terminal', 'open');
        } else if (status === 'closed' || status === 'exited') {
          useConnectionStore.getState().setStatus('terminal', 'closed');
        }
        this.emitSessionChange(id, status, exitCode);
      },
      onCwdChange: (cwd) => this.emitCwdChange(id, cwd),
      onActivity: () => this.emitActivity(id),
      onBackpressureChange: (_paused) => {
        // Status change handles backpressure UI via store update
        // (emitted through the session listener).
      },
    });

    // If we have a server session ID (e.g., from sessionStorage persistence),
    // set it on the connection so it reconnects to the existing PTY.
    if (opts?.serverSessionId) {
      // The connection was created without serverSessionId in its URL.
      // For reconnection to work, we need to update the connection.
      // The session control frame from the server will set it properly.
    }

    this.controllers.set(id, controller);
    this.emitSessionChange(id, controller.status, null);
  }

  closeSession(id: string): void {
    const controller = this.controllers.get(id);
    if (!controller) return;
    controller.close();
    this.controllers.delete(id);
  }

  restartSession(id: string): void {
    const controller = this.controllers.get(id);
    if (!controller) return;
    controller.restart();
  }

  // DOM
  attach(id: string, host: HTMLElement): void {
    this.controllers.get(id)?.attach(host);
  }

  detach(id: string): void {
    this.controllers.get(id)?.detach();
  }

  activate(id: string): void {
    this.controllers.get(id)?.activate();
  }

  // Search
  findNext(id: string, query: string, opts?: import('@xterm/addon-search').ISearchOptions): boolean {
    return this.controllers.get(id)?.findNext(query, opts) ?? false;
  }

  findPrevious(id: string, query: string, opts?: import('@xterm/addon-search').ISearchOptions): boolean {
    return this.controllers.get(id)?.findPrevious(query, opts) ?? false;
  }

  clearSearchHighlight(id: string): void {
    this.controllers.get(id)?.clearSearch();
  }

  // Selection / clipboard
  hasSelection(id: string): boolean { return this.controllers.get(id)?.hasSelection() ?? false; }
  getSelection(id: string): string { return this.controllers.get(id)?.getSelection() ?? ''; }
  selectAll(id: string): void { this.controllers.get(id)?.selectAll(); }
  paste(id: string, text: string): void { this.controllers.get(id)?.paste(text); }
  clearBuffer(id: string): void { this.controllers.get(id)?.clearBuffer(); }

  // Injection
  setFileLinkHandler(handler: FileLinkHandler): void {
    this._fileLinkHandler = handler;
  }

  setReservedKeyPredicate(predicate: ReservedKeyPredicate | null): void {
    this._reservedKeyPredicate = predicate;
  }

  // ── Listeners ─────────────────────────────────────────────────────────

  onSessionChange(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onCwdChange(listener: CwdListener): () => void {
    this.cwdListeners.add(listener);
    return () => this.cwdListeners.delete(listener);
  }

  onActivity(listener: ActivityListener): () => void {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private applyTheme(appTheme: AppTheme): void {
    const t = TERMINAL_THEMES[resolveTheme(appTheme)];
    if (!t) return;
    for (const c of this.controllers.values()) c.setTheme(t);
  }

  private buildReservedKeyPredicate(): void {
    const mac = isMacPlatform();
    this._reservedKeyPredicate = (event) => {
      const k = event.key.toLowerCase();
      if (event.ctrlKey && k === 'tab') return true;
      const primaryMod = mac ? event.metaKey : event.ctrlKey;
      if (!primaryMod) return false;
      if (event.shiftKey && (k === 'r' || k === 'o' || k === 'enter')) return true;
      if (!event.shiftKey && (k === 't' || k === 'w' || k === 'f' || k === 'k' || k === 'd')) return true;
      if (event.key === '[' || event.key === ']') return true;
      if (/^[1-9]$/.test(event.key)) return true;
      return false;
    };
  }

  private emitSessionChange(id: string, status: SessionStatus, exitCode: number | null): void {
    for (const l of this.listeners) {
      try { l(id, status, exitCode); } catch { /* ignore */ }
    }
  }

  private emitCwdChange(id: string, cwd: string | null): void {
    for (const l of this.cwdListeners) {
      try { l(id, cwd); } catch { /* ignore */ }
    }
  }

  private emitActivity(id: string): void {
    for (const l of this.activityListeners) {
      try { l(id); } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let singleton: TerminalRegistry | null = null;

export function getTerminalRegistry(): TerminalRegistry {
  if (!singleton) singleton = new TerminalRegistry();
  return singleton;
}

/** @deprecated Use `terminalRegistry` instead. Temporary alias for migration. */
export function getTerminalManager(): TerminalRegistry {
  return getTerminalRegistry();
}

export const terminalRegistry = getTerminalRegistry();

/** @deprecated Use `terminalRegistry` instead. Temporary alias for migration. */
export const terminalManager = terminalRegistry;

if (typeof window !== 'undefined') {
  const hot = (import.meta as ImportMeta & { hot?: { dispose: (cb: () => void) => void } }).hot;
  hot?.dispose(() => {
    try { terminalRegistry.dispose(); } catch { /* ignore */ }
  });
}
