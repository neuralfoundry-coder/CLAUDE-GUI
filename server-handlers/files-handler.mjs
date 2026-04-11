import path from 'node:path';

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

async function ensureWatcher() {
  const root = path.resolve(process.env.PROJECT_ROOT || process.cwd());
  if (sharedWatcher && watcherRoot === root) return sharedWatcher;
  if (sharedWatcher) {
    try {
      await sharedWatcher.close();
    } catch {
      /* ignore */
    }
  }
  sharedWatcher = await loadWatcher(root);
  watcherRoot = root;

  const broadcast = (event) => (p) => {
    const rel = path.relative(root, p) || '.';
    const msg = JSON.stringify({
      type: 'change',
      event,
      path: rel,
      timestamp: new Date().toISOString(),
    });
    for (const ws of connections) {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(msg);
        } catch {
          /* ignore */
        }
      }
    }
  };

  ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].forEach((evt) => {
    sharedWatcher.on(evt, broadcast(evt));
  });
  sharedWatcher.on('ready', () => {
    const msg = JSON.stringify({
      type: 'change',
      event: 'ready',
      path: '.',
      timestamp: new Date().toISOString(),
    });
    for (const ws of connections) {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(msg);
        } catch {
          /* ignore */
        }
      }
    }
  });

  return sharedWatcher;
}

export default async function filesHandler(ws, _req) {
  connections.add(ws);
  try {
    await ensureWatcher();
    ws.send(JSON.stringify({ type: 'ready' }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: String(err?.message || err) }));
  }

  ws.on('close', () => {
    connections.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('[files-handler] ws error', err);
    connections.delete(ws);
  });
}
