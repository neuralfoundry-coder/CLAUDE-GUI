import path from 'node:path';
import { getActiveRoot, onActiveRootChange } from '../src/lib/project/project-context.mjs';
import { createDebug } from '../src/lib/debug.mjs';

const dbg = createDebug('files');

async function loadWatcher(rootAbs) {
  const chokidar = await import('chokidar');
  const watcher = chokidar.watch(rootAbs, {
    ignored: [
      /(^|[/\\])\.(?!claude-project$)/,
      /node_modules/,
      /\.next/,
      /dist|build|out/,
      /\.DS_Store/,
    ],
    followSymlinks: false,
    persistent: true,
    ignoreInitial: true,
  });
  return watcher;
}

const connections = new Set();
let sharedWatcher = null;
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
  if (sharedWatcher && watcherRoot === root) return sharedWatcher;
  if (sharedWatcher) {
    dbg.info('closing existing watcher on', watcherRoot);
    try {
      await sharedWatcher.close();
    } catch (err) {
      dbg.error('close failed', err);
    }
    sharedWatcher = null;
    watcherRoot = null;
  }
  if (!root) {
    dbg.info('no active project root; watcher idle');
    return null;
  }
  dbg.info('starting watcher on', root);
  sharedWatcher = await loadWatcher(root);
  watcherRoot = root;

  const broadcastEvent = (event) => (p) => {
    const currentRoot = watcherRoot;
    if (!currentRoot) return;
    const rel = path.relative(currentRoot, p) || '.';
    dbg.trace(event, rel);
    broadcastAll({
      type: 'change',
      event,
      path: rel,
      timestamp: new Date().toISOString(),
    });
  };

  ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].forEach((evt) => {
    sharedWatcher.on(evt, broadcastEvent(evt));
  });
  sharedWatcher.on('ready', () => {
    broadcastAll({
      type: 'change',
      event: 'ready',
      path: '.',
      timestamp: new Date().toISOString(),
    });
  });

  return sharedWatcher;
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
