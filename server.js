#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
const http = require('node:http');
const { parse } = require('node:url');
const next = require('next');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);

// Lazy-load the module-based debug helper (ESM). Fallback to console.* if
// the dynamic import fails so we never crash on a missing helper.
let dbg = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  trace: console.log.bind(console),
};
(async () => {
  try {
    const { createDebug } = await import('./src/lib/debug.mjs');
    dbg = createDebug('server');
  } catch {
    /* keep fallback */
  }
})();

const app = next({ dev, hostname, port });

const ALLOWED_ORIGINS = new Set([
  `http://${hostname}:${port}`,
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
]);

function verifyOrigin(req) {
  if (!dev && process.env.ALLOW_ANY_ORIGIN === 'true') return true;
  const origin = req.headers.origin;
  if (!origin) return dev;
  return ALLOWED_ORIGINS.has(origin);
}

async function main() {
  await app.prepare();

  // NextCustomServer attaches its own `upgrade` listener to our HTTP server on
  // first request (via `setupWebSocketHandler`), which conflicts with our own
  // routing of /ws/* endpoints. We short-circuit that setup and route
  // `/_next/*` upgrades explicitly below.
  if (app && typeof app === 'object') {
    app.didWebSocketSetup = true;
  }

  // Resolve handlers after prepare() so internal `this` context is fully bound.
  const nextHandler = app.getRequestHandler();
  const upgradeHandler = typeof app.getUpgradeHandler === 'function' ? app.getUpgradeHandler() : null;

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || '/', true);
      await nextHandler(req, res, parsedUrl);
    } catch (err) {
      dbg.error('request handler error', err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // WebSocket servers per endpoint (no server attached - we handle upgrade manually)
  const wssTerminal = new WebSocketServer({ noServer: true });
  const wssClaude = new WebSocketServer({ noServer: true });
  const wssFiles = new WebSocketServer({ noServer: true });

  // Lazy-load handlers to avoid module loading cost in tests
  const loadHandler = async (name) => {
    const mod = await import(`./server-handlers/${name}.mjs`);
    return mod.default;
  };

  wssTerminal.on('connection', async (ws, req) => {
    const handler = await loadHandler('terminal-handler');
    handler(ws, req);
  });

  wssClaude.on('connection', async (ws, req) => {
    const handler = await loadHandler('claude-handler');
    handler(ws, req);
  });

  wssFiles.on('connection', async (ws, req) => {
    const handler = await loadHandler('files-handler');
    handler(ws, req);
  });

  // Heartbeat: ping clients every 29s, terminate stale ones
  const heartbeat = setInterval(() => {
    [wssTerminal, wssClaude, wssFiles].forEach((wss) => {
      wss.clients.forEach((client) => {
        if (client.isAlive === false) {
          try {
            client.terminate();
          } catch {
            /* ignore */
          }
          return;
        }
        client.isAlive = false;
        try {
          client.ping();
        } catch {
          /* ignore */
        }
      });
    });
  }, 29_000);

  function setupPong(wss) {
    wss.on('connection', (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
    });
  }
  setupPong(wssTerminal);
  setupPong(wssClaude);
  setupPong(wssFiles);

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url || '/');

    // Preserve Next.js HMR WebSocket in dev
    if (pathname && pathname.startsWith('/_next')) {
      if (upgradeHandler) {
        try {
          upgradeHandler(req, socket, head);
        } catch (err) {
          dbg.error('next upgrade handler error', err);
          socket.destroy();
        }
      } else {
        socket.destroy();
      }
      return;
    }

    // Origin check for application WebSockets
    if (!verifyOrigin(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    if (pathname === '/ws/terminal') {
      wssTerminal.handleUpgrade(req, socket, head, (ws) => {
        wssTerminal.emit('connection', ws, req);
      });
    } else if (pathname === '/ws/claude') {
      wssClaude.handleUpgrade(req, socket, head, (ws) => {
        wssClaude.emit('connection', ws, req);
      });
    } else if (pathname === '/ws/files') {
      wssFiles.handleUpgrade(req, socket, head, (ws) => {
        wssFiles.emit('connection', ws, req);
      });
    } else {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  });

  server.listen(port, hostname, () => {
    dbg.info(`ClaudeGUI ready on http://${hostname}:${port} (mode=${dev ? 'dev' : 'prod'})`);
  });

  const shutdown = () => {
    dbg.info('shutting down');
    clearInterval(heartbeat);
    [wssTerminal, wssClaude, wssFiles].forEach((wss) => {
      wss.clients.forEach((client) => {
        try {
          client.close();
        } catch {
          /* ignore */
        }
      });
      wss.close();
    });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  dbg.error('fatal error', err);
  process.exit(1);
});
