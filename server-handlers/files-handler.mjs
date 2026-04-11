import path from 'node:path';
import { getActiveRoot, onActiveRootChange } from '../src/lib/project/project-context.mjs';
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

const connections = new Set();
let sharedSubscription = null;
let watcherRoot = null;
let rootChangeUnsubscribe = null;

function broadcastAll(message) {
  const msg = typeof message === 'string' ? message : JSON.stringify(message);
  for (const ws of connections) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(msg);
      } catch {
        /* ignore */
      }
    }
  }
}

async function rebuildWatcher() {
  const root = getActiveRoot();
  if (sharedSubscription && watcherRoot === root) return sharedSubscription;
  if (sharedSubscription) {
    dbg.info('closing existing watcher on', watcherRoot);
    try {
      await sharedSubscription.unsubscribe();
    } catch (err) {
      dbg.error('unsubscribe failed', err);
    }
    sharedSubscription = null;
    watcherRoot = null;
  }
  if (!root) {
    dbg.info('no active project root; watcher idle');
    return null;
  }
  dbg.info('starting watcher on', root);

  const handleEvents = (events) => {
    const currentRoot = watcherRoot;
    if (!currentRoot) return;
    for (const ev of events) {
      if (isIgnoredByWatcher(ev.path)) continue;
      const rel = path.relative(currentRoot, ev.path) || '.';
      const mapped = mapEvent(ev.type);
      dbg.trace(mapped, rel);
      broadcastAll({
        type: 'change',
        event: mapped,
        path: rel,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleError = (err) => {
    dbg.error('watcher error', err);
    broadcastAll({
      type: 'change',
      event: 'error',
      path: '.',
      message: String(err?.message || err),
      timestamp: new Date().toISOString(),
    });
  };

  sharedSubscription = await loadWatcher(root, handleEvents, handleError);
  watcherRoot = root;

  broadcastAll({
    type: 'change',
    event: 'ready',
    path: '.',
    timestamp: new Date().toISOString(),
  });

  return sharedSubscription;
}

async function ensureWatcher() {
  if (!rootChangeUnsubscribe) {
    rootChangeUnsubscribe = onActiveRootChange(async (newRoot) => {
      dbg.info('active root changed ->', newRoot);
      try {
        await rebuildWatcher();
      } catch (err) {
        dbg.error('rebuild watcher failed', err);
      }
      broadcastAll({
        type: 'project-changed',
        root: newRoot,
        timestamp: new Date().toISOString(),
      });
    });
  }
  return rebuildWatcher();
}

export default async function filesHandler(ws, _req) {
  connections.add(ws);
  dbg.log('client connected, total=', connections.size);
  try {
    await ensureWatcher();
    ws.send(
      JSON.stringify({
        type: 'ready',
        root: getActiveRoot(),
      }),
    );
  } catch (err) {
    dbg.error('handler init failed', err);
    ws.send(JSON.stringify({ type: 'error', message: String(err?.message || err) }));
  }

  ws.on('close', () => {
    connections.delete(ws);
    dbg.log('client disconnected, total=', connections.size);
  });

  ws.on('error', (err) => {
    dbg.error('ws error', err);
    connections.delete(ws);
  });
}
