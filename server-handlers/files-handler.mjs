import path from 'node:path';
import { getActiveRoot } from '../src/lib/project/project-context.mjs';
import { browserSessionRegistry } from '../src/lib/project/browser-session-registry.mjs';
import { createDebug } from '../src/lib/debug.mjs';

const dbg = createDebug('files');

// We subscribe via @parcel/watcher, which uses the native FSEvents / inotify /
// ReadDirectoryChangesW APIs. A single subscription watches the entire project
// tree with 1 OS handle — unlike chokidar 5's `fs.watch` fallback, which burns
// 1 file descriptor per directory and hits the macOS per-process 256 FD limit
// (EMFILE) on non-trivial projects.
const IGNORE_DIR_NAMES = [
  'node_modules',
  '.next',
  '.git',
  '.claude',
  '.claude-worktrees',
  '.turbo',
  '.cache',
  'dist',
  'build',
  'out',
  'coverage',
  'test-results',
  'playwright-report',
];

// Native ignore globs — these subtrees are never scanned or watched.
export const WATCHER_IGNORE_GLOBS = IGNORE_DIR_NAMES.flatMap((name) => [
  `**/${name}`,
  `**/${name}/**`,
]);

function segmentPattern(name) {
  return new RegExp(`(^|[/\\\\])${name.replace(/\./g, '\\.')}($|[/\\\\])`);
}

// Hidden dotfiles/dirs, keeping `.claude-project` visible (user-facing config).
const HIDDEN_DOT_SEGMENT =
  /(^|[/\\])\.(?!claude-project($|[/\\]))[^/\\]*($|[/\\])/;

// JS-level filter for the remaining policy (dotfiles, .DS_Store, and any heavy
// directory that somehow slipped past the native ignore on weird filesystems).
export const WATCHER_IGNORE_PATTERNS = [
  HIDDEN_DOT_SEGMENT,
  ...IGNORE_DIR_NAMES.map(segmentPattern),
];

export function isIgnoredByWatcher(p) {
  return WATCHER_IGNORE_PATTERNS.some((re) => re.test(p));
}

function mapEvent(type) {
  if (type === 'create') return 'add';
  if (type === 'delete') return 'unlink';
  return 'change';
}

async function loadWatcher(rootAbs, onEvents, onError) {
  const mod = await import('@parcel/watcher');
  const subscribe = mod.subscribe ?? mod.default?.subscribe;
  return subscribe(
    rootAbs,
    (err, events) => {
      if (err) {
        onError(err);
        return;
      }
      onEvents(events);
    },
    { ignore: WATCHER_IGNORE_GLOBS },
  );
}

// ---------------------------------------------------------------------------
// Multi-browser connection & watcher management
// ---------------------------------------------------------------------------

/** @type {Map<WebSocket, { browserId: string|null, root: string|null, acquired: boolean }>} */
const connections = new Map();

/**
 * Per-root watcher registry.  Multiple tabs on the same project share one
 * OS-level watcher to save file descriptors.
 * @type {Map<string, { subscription: any, refCount: number, gcTimer: NodeJS.Timeout|null }>}
 */
const watchers = new Map();

/** Grace period before tearing down an unused watcher (covers quick project switches). */
const WATCHER_GC_MS = 5000;

/** Send a JSON message to a single ws if it's still open. */
function sendTo(ws, message) {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(typeof message === 'string' ? message : JSON.stringify(message));
    } catch {
      /* ignore */
    }
  }
}

/** Broadcast a message to all connections watching a specific root. */
function broadcastToRoot(root, message) {
  const msg = typeof message === 'string' ? message : JSON.stringify(message);
  for (const [ws, meta] of connections) {
    if (meta.root === root && ws.readyState === ws.OPEN) {
      try {
        ws.send(msg);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Broadcast to connections with a specific browserId. */
function broadcastToBrowser(browserId, message) {
  const msg = typeof message === 'string' ? message : JSON.stringify(message);
  for (const [ws, meta] of connections) {
    if (meta.browserId === browserId && ws.readyState === ws.OPEN) {
      try {
        ws.send(msg);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Acquire (or increment refcount on) a watcher for the given root.
 * Returns the subscription.
 */
async function acquireWatcher(root) {
  const existing = watchers.get(root);
  if (existing) {
    // Cancel pending GC if any.
    if (existing.gcTimer) {
      clearTimeout(existing.gcTimer);
      existing.gcTimer = null;
    }
    existing.refCount += 1;
    dbg.info('acquireWatcher reuse', { root, refCount: existing.refCount });
    return existing.subscription;
  }

  dbg.info('acquireWatcher new', { root });

  // Batch events in a 150ms window to avoid flooding clients during rapid
  // changes (e.g. npm install, git checkout). Events are deduplicated by
  // path, keeping the latest event type.
  let pendingBatch = new Map();
  let batchTimer = null;
  const BATCH_INTERVAL_MS = 150;

  const flushBatch = () => {
    batchTimer = null;
    if (pendingBatch.size === 0) return;
    const batch = Array.from(pendingBatch.values());
    pendingBatch = new Map();
    const ts = new Date().toISOString();
    for (const item of batch) {
      broadcastToRoot(root, {
        type: 'change',
        event: item.event,
        path: item.path,
        timestamp: ts,
      });
    }
  };

  const handleEvents = (events) => {
    for (const ev of events) {
      if (isIgnoredByWatcher(ev.path)) continue;
      const rel = path.relative(root, ev.path) || '.';
      const mapped = mapEvent(ev.type);
      dbg.trace(mapped, rel);
      pendingBatch.set(rel, { event: mapped, path: rel });
    }
    if (!batchTimer) {
      batchTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
    }
  };

  const handleError = (err) => {
    dbg.error('watcher error', { root, err });
    broadcastToRoot(root, {
      type: 'change',
      event: 'error',
      path: '.',
      message: String(err?.message || err),
      timestamp: new Date().toISOString(),
    });
  };

  const subscription = await loadWatcher(root, handleEvents, handleError);
  watchers.set(root, { subscription, refCount: 1, gcTimer: null });
  return subscription;
}

/**
 * Release (decrement refcount on) a watcher.  When refCount hits 0, schedule
 * a delayed teardown so quick project switches don't churn OS handles.
 */
function releaseWatcher(root) {
  const entry = watchers.get(root);
  if (!entry) return;
  entry.refCount = Math.max(0, entry.refCount - 1);
  dbg.info('releaseWatcher', { root, refCount: entry.refCount });
  if (entry.refCount === 0) {
    entry.gcTimer = setTimeout(async () => {
      // Re-check: someone may have acquired during the grace period.
      if (entry.refCount === 0) {
        dbg.info('tearing down idle watcher', { root });
        try {
          await entry.subscription.unsubscribe();
        } catch (err) {
          dbg.error('watcher unsubscribe failed', err);
        }
        watchers.delete(root);
      }
    }, WATCHER_GC_MS);
  }
}

// ---------------------------------------------------------------------------
// Global registry listener — reacts when any browser session's root changes
// (triggered by POST /api/project).  Updates connection metadata, switches
// watchers, and sends project-changed to the right browser tabs.
// ---------------------------------------------------------------------------

let _registryListenerInstalled = false;

function ensureRegistryListener() {
  if (_registryListenerInstalled) return;
  _registryListenerInstalled = true;

  browserSessionRegistry.onAnyRootChange(async (browserId, newRoot, oldRoot) => {
    dbg.info('registry root change', { browserId: browserId?.slice(0, 8), from: oldRoot, to: newRoot });

    // Update connection metadata and switch watchers.
    // Acquire NEW root first; only release the old one after success, so a
    // failed acquire never leaves the connection with zero watchers.
    for (const [, meta] of connections) {
      if (meta.browserId !== browserId) continue;
      const prev = meta.root;
      if (prev === newRoot) continue;

      let newAcquired = false;
      if (newRoot) {
        try {
          await acquireWatcher(newRoot);
          newAcquired = true;
        } catch (err) {
          dbg.error('failed to acquire watcher for new root, keeping previous', err);
          // Keep prev root + watcher; metadata stays pointed at prev.
          continue;
        }
      }
      if (prev && meta.acquired) releaseWatcher(prev);
      meta.root = newRoot;
      meta.acquired = newAcquired;
    }

    // Send project-changed only to this browser's connections.
    broadcastToBrowser(browserId, {
      type: 'project-changed',
      root: newRoot,
      timestamp: new Date().toISOString(),
    });
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function filesHandler(ws, req) {
  ensureRegistryListener();
  const browserId = req.browserId || null;

  // Ensure the registry knows about this browser.
  if (browserId) {
    browserSessionRegistry.ensureSession(browserId);
  }

  const root = browserSessionRegistry.getRoot(browserId);

  const meta = { browserId, root, acquired: false };
  connections.set(ws, meta);
  dbg.log('client connected', { browserId: browserId?.slice(0, 8), root, total: connections.size });

  // Acquire a watcher for this connection's root.
  if (root) {
    try {
      await acquireWatcher(root);
      meta.acquired = true;
      sendTo(ws, { type: 'ready', root });

      // Send initial ready event for this root.
      sendTo(ws, {
        type: 'change',
        event: 'ready',
        path: '.',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      dbg.error('handler init failed', err);
      sendTo(ws, { type: 'error', message: String(err?.message || err) });
      // acquired stays false — close handler will skip releaseWatcher.
    }
  } else {
    sendTo(ws, { type: 'ready', root: null });
  }

  ws.on('close', () => {
    const m = connections.get(ws);
    connections.delete(ws);
    dbg.log('client disconnected', { browserId: browserId?.slice(0, 8), total: connections.size });

    // Release watcher only if we actually acquired one.
    if (m?.acquired && m.root) {
      releaseWatcher(m.root);
    }

    // Check if any other connections remain for this browserId.
    if (browserId) {
      const hasOthers = [...connections.values()].some((c) => c.browserId === browserId);
      if (!hasOthers) {
        browserSessionRegistry.scheduleGc(browserId);
      }
    }
  });

  ws.on('error', (err) => {
    dbg.error('ws error', err);
    const m = connections.get(ws);
    connections.delete(ws);
    if (m?.acquired && m.root) {
      releaseWatcher(m.root);
    }
  });
}

