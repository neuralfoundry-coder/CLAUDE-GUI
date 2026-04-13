/**
 * BrowserSessionRegistry — maps per-tab `browserId` to independent project
 * roots so multiple browser tabs can work on different projects simultaneously.
 *
 * Wraps (does not replace) the existing `project-context.mjs` singleton:
 *   - `recents` and `state.json` persistence are still handled globally.
 *   - When `browserId` is absent or unknown, falls back to `getActiveRoot()`.
 */

import {
  getActiveRoot,
  getRecents,
  setActiveRoot,
  validateProjectRoot,
} from './project-context.mjs';
import { createDebug } from '../debug.mjs';

const dbg = createDebug('browser-session');

/**
 * Grace period after all WebSocket connections for a browserId disconnect
 * before the session is reaped.  Matches the terminal registry's 30-minute
 * window so tab refreshes don't lose state.
 */
const GC_TIMEOUT_MS = 30 * 60 * 1000;

/** Periodic sweep interval — 5 minutes. */
const GC_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const GLOBAL_KEY = '__claudegui_browser_session_registry__';

/**
 * @typedef {{ root: string, lastSeen: number, gcTimer: NodeJS.Timeout|null, listeners: Set<(root: string) => void> }} BrowserSession
 */

class BrowserSessionRegistry {
  constructor() {
    /** @type {Map<string, BrowserSession>} */
    this.sessions = new Map();

    /** @type {Set<(browserId: string, newRoot: string) => void>} */
    this._globalListeners = new Set();

    // Periodic GC sweep for sessions that haven't been touched.
    this._gcInterval = setInterval(() => this._sweep(), GC_SWEEP_INTERVAL_MS);
    if (this._gcInterval.unref) this._gcInterval.unref();
  }

  /**
   * Get the project root for a browser tab.  Falls back to the global
   * singleton when the browserId is unknown or absent.
   */
  getRoot(browserId) {
    if (!browserId) return getActiveRoot();
    const session = this.sessions.get(browserId);
    if (session) {
      session.lastSeen = Date.now();
      return session.root;
    }
    // Unknown browserId — fall back to global root (first connection before
    // the client has called setRoot).
    return getActiveRoot();
  }

  /**
   * Set the project root for a specific browser tab.
   * Also updates the global recents list via project-context.
   */
  setRoot(browserId, newRoot) {
    validateProjectRoot(newRoot);
    const existing = this.sessions.get(browserId);
    const oldRoot = existing?.root ?? null;

    if (existing) {
      if (existing.root === newRoot) {
        existing.lastSeen = Date.now();
        return newRoot;
      }
      existing.root = newRoot;
      existing.lastSeen = Date.now();
    } else {
      this.sessions.set(browserId, {
        root: newRoot,
        lastSeen: Date.now(),
        gcTimer: null,
        listeners: new Set(),
      });
    }

    // Update global recents & lastRoot via the singleton.
    // setActiveRoot broadcasts to legacy listeners — but we now only want
    // per-browserId notification, so we call it purely for persistence.
    try {
      setActiveRoot(newRoot);
    } catch {
      // Ignore if identical root (already set globally).
    }

    dbg.info('setRoot', { browserId: browserId.slice(0, 8), from: oldRoot, to: newRoot });

    // Notify per-session listeners.
    const session = this.sessions.get(browserId);
    if (session) {
      for (const listener of session.listeners) {
        try {
          listener(newRoot);
        } catch (err) {
          dbg.error('session listener error', err);
        }
      }
    }

    // Notify global listeners (used by files-handler to update watchers
    // and send project-changed to the correct browser connections).
    for (const listener of this._globalListeners) {
      try {
        listener(browserId, newRoot, oldRoot);
      } catch (err) {
        dbg.error('global listener error', err);
      }
    }

    return newRoot;
  }

  /**
   * Register a global listener that fires whenever ANY session's root changes.
   * Callback signature: (browserId, newRoot, oldRoot) => void
   */
  onAnyRootChange(listener) {
    this._globalListeners.add(listener);
    return () => this._globalListeners.delete(listener);
  }

  /** Touch a session's lastSeen timestamp. */
  touch(browserId) {
    if (!browserId) return;
    const session = this.sessions.get(browserId);
    if (session) {
      session.lastSeen = Date.now();
      if (session.gcTimer) {
        clearTimeout(session.gcTimer);
        session.gcTimer = null;
      }
    }
  }

  /**
   * Ensure a session exists for a browserId. Creates one with the global
   * root as default if it doesn't exist yet.
   */
  ensureSession(browserId) {
    if (!browserId) return;
    if (this.sessions.has(browserId)) {
      this.touch(browserId);
      return;
    }
    const root = getActiveRoot();
    this.sessions.set(browserId, {
      root,
      lastSeen: Date.now(),
      gcTimer: null,
      listeners: new Set(),
    });
    dbg.info('ensureSession (new)', { browserId: browserId.slice(0, 8), root });
  }

  /**
   * Schedule GC for a browserId — called when all its WebSocket connections
   * have closed.  The timer is cancelled if a new connection arrives.
   */
  scheduleGc(browserId) {
    if (!browserId) return;
    const session = this.sessions.get(browserId);
    if (!session) return;
    if (session.gcTimer) clearTimeout(session.gcTimer);
    session.gcTimer = setTimeout(() => {
      dbg.info('GC expired browser session', { browserId: browserId.slice(0, 8) });
      this._removeSession(browserId);
    }, GC_TIMEOUT_MS);
    dbg.info('scheduled GC', { browserId: browserId.slice(0, 8), gcInMs: GC_TIMEOUT_MS });
  }

  /** Immediately remove a session. */
  _removeSession(browserId) {
    const session = this.sessions.get(browserId);
    if (!session) return;
    if (session.gcTimer) {
      clearTimeout(session.gcTimer);
      session.gcTimer = null;
    }
    session.listeners.clear();
    this.sessions.delete(browserId);
    dbg.info('removed session', { browserId: browserId.slice(0, 8) });
  }

  /** Sweep sessions that haven't been touched in GC_TIMEOUT_MS. */
  _sweep() {
    const now = Date.now();
    for (const [browserId, session] of this.sessions) {
      if (now - session.lastSeen > GC_TIMEOUT_MS && !session.gcTimer) {
        dbg.info('sweep: removing stale session', { browserId: browserId.slice(0, 8) });
        this._removeSession(browserId);
      }
    }
  }

  /** Get the global recents list (shared across all sessions). */
  getRecents() {
    return getRecents();
  }

  /** Number of active sessions (for diagnostics). */
  size() {
    return this.sessions.size;
  }

  /** Check if any session has the given browserId. */
  has(browserId) {
    return this.sessions.has(browserId);
  }
}

function getRegistry() {
  const g = globalThis;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new BrowserSessionRegistry();
  }
  return g[GLOBAL_KEY];
}

/** @type {BrowserSessionRegistry} */
export const browserSessionRegistry = getRegistry();

export const BROWSER_SESSION_CONSTANTS = Object.freeze({
  GC_TIMEOUT_MS,
  GC_SWEEP_INTERVAL_MS,
});
