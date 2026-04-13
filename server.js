#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
const http = require('node:http');
const { parse } = require('node:url');
const next = require('next');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const envHostname = process.env.HOST; // explicit HOST env takes precedence
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

// ---------------------------------------------------------------------------
// Server config (remote access)
// ---------------------------------------------------------------------------

/** @returns {{ remoteAccess: boolean, remoteAccessToken: string|null }} */
function loadConfigSync() {
  try {
    const { loadServerConfigSync } = require('./src/lib/server-config.mjs');
    return loadServerConfigSync();
  } catch {
    // Fallback: try dynamic import path with readFileSync
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const os = require('node:os');
      const raw = fs.readFileSync(
        path.join(os.homedir(), '.claudegui', 'server-config.json'),
        'utf-8',
      );
      const parsed = JSON.parse(raw);
      return {
        remoteAccess: typeof parsed.remoteAccess === 'boolean' ? parsed.remoteAccess : false,
        remoteAccessToken: typeof parsed.remoteAccessToken === 'string' ? parsed.remoteAccessToken : null,
        anthropicApiKey: typeof parsed.anthropicApiKey === 'string' && parsed.anthropicApiKey.length > 0 ? parsed.anthropicApiKey : null,
      };
    } catch {
      return { remoteAccess: false, remoteAccessToken: null, anthropicApiKey: null };
    }
  }
}

let serverConfig = loadConfigSync();

// Inject saved API key into process.env (respects explicit env var if already set)
if (serverConfig.anthropicApiKey && !process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = serverConfig.anthropicApiKey;
}

function resolveHostname() {
  if (envHostname) return envHostname; // HOST env always wins
  return serverConfig.remoteAccess ? '0.0.0.0' : '127.0.0.1';
}

let hostname = resolveHostname();

// Expose current server state to Next.js API routes via globalThis
globalThis.__serverHostname = hostname;
globalThis.__serverPort = port;
globalThis.__serverConfig = serverConfig;

// ---------------------------------------------------------------------------
// Origin / token verification
// ---------------------------------------------------------------------------

function buildAllowedOrigins(h, p) {
  const s = new Set([
    `http://${h}:${p}`,
    `http://localhost:${p}`,
    `http://127.0.0.1:${p}`,
  ]);
  if (h === '0.0.0.0') {
    // When binding to all interfaces, also allow the actual LAN IP origins.
    // We can't enumerate them statically here, so we rely on token auth
    // for remote clients. But add common patterns for convenience.
    s.add(`http://0.0.0.0:${p}`);
  }
  return s;
}

let ALLOWED_ORIGINS = buildAllowedOrigins(hostname, port);

function isLocalhostAddr(addr) {
  if (!addr) return true; // no address info => treat as local (e.g. unix socket)
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function verifyToken(req) {
  if (!serverConfig.remoteAccess || !serverConfig.remoteAccessToken) return true;

  // Localhost connections are exempt from token checks
  const remoteAddr = req.socket?.remoteAddress || req.connection?.remoteAddress;
  if (isLocalhostAddr(remoteAddr)) return true;

  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      if (parts[1] === serverConfig.remoteAccessToken) return true;
    }
  }

  // Check URL query parameter (for WebSocket upgrade requests)
  try {
    const { query } = parse(req.url || '/', true);
    if (query.token === serverConfig.remoteAccessToken) return true;
  } catch { /* ignore parse errors */ }

  return false;
}

function verifyOrigin(req) {
  // When remote access is on with a valid token, skip origin check
  if (serverConfig.remoteAccess && serverConfig.remoteAccessToken) {
    if (verifyToken(req)) return true;
  }

  if (!dev && process.env.ALLOW_ANY_ORIGIN === 'true') return true;
  const origin = req.headers.origin;
  if (!origin) return dev;
  return ALLOWED_ORIGINS.has(origin);
}

const app = next({ dev, hostname: '127.0.0.1', port });

// ---------------------------------------------------------------------------
// Main server setup
// ---------------------------------------------------------------------------

/** @type {http.Server|null} */
let currentServer = null;
/** @type {NodeJS.Timeout|null} */
let heartbeatInterval = null;
/** @type {WebSocketServer[]} */
let wsServers = [];

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
  // Cache them for in-process restarts.
  _nextHandler = app.getRequestHandler();
  _upgradeHandler = typeof app.getUpgradeHandler === 'function' ? app.getUpgradeHandler() : null;

  await startServer(_nextHandler, _upgradeHandler);
}

async function startServer(nextHandler, upgradeHandler) {
  // Reload config in case it changed (e.g. after restart)
  serverConfig = loadConfigSync();
  hostname = resolveHostname();
  ALLOWED_ORIGINS = buildAllowedOrigins(hostname, port);

  // Update globals
  globalThis.__serverHostname = hostname;
  globalThis.__serverPort = port;
  globalThis.__serverConfig = serverConfig;

  const server = http.createServer(async (req, res) => {
    // Token auth middleware for remote requests
    if (!verifyToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Unauthorized: invalid or missing token' }));
      return;
    }

    // Fast-path: abort all active Claude queries (called via sendBeacon on page unload)
    const parsedUrl = parse(req.url || '/', true);
    if (parsedUrl.pathname === '/api/claude/abort' && req.method === 'POST') {
      try {
        const { activeAbortControllers } = await import('./server-handlers/claude-handler.mjs');
        let aborted = 0;
        for (const controller of activeAbortControllers) {
          try { controller.abort(); aborted++; } catch { /* ignore */ }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, aborted }));
      } catch (err) {
        dbg.error('abort handler error', err);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, aborted: 0 }));
      }
      return;
    }

    try {
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
  wsServers = [wssTerminal, wssClaude, wssFiles];

  // Lazy-load handlers to avoid module loading cost in tests
  const loadHandler = async (name) => {
    const mod = await import(`./server-handlers/${name}.mjs`);
    return mod.default;
  };

  wssTerminal.on('connection', async (ws, req) => {
    try {
      const handler = await loadHandler('terminal-handler');
      await handler(ws, req);
    } catch (err) {
      dbg.error('[ws/terminal] handler error', err);
      try { ws.close(); } catch { /* ignore */ }
    }
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
  heartbeatInterval = setInterval(() => {
    wsServers.forEach((wss) => {
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
    const parsed = parse(req.url || '/', true);
    const pathname = parsed.pathname;

    // Attach browserId from query string so handlers can isolate per-tab state.
    req.browserId = (parsed.query && parsed.query.browserId) || null;

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

    // Token check for application WebSockets
    if (!verifyToken(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
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

  return new Promise((resolve) => {
    server.listen(port, hostname, () => {
      currentServer = server;
      dbg.info(`ClaudeGUI ready on http://${hostname}:${port} (mode=${dev ? 'dev' : 'prod'}, remote=${serverConfig.remoteAccess})`);

      if (serverConfig.remoteAccess) {
        if (serverConfig.remoteAccessToken) {
          dbg.info('Remote access enabled with token authentication');
        } else {
          dbg.warn('⚠ Remote access enabled WITHOUT token — any network client can connect!');
        }
      }

      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// In-process restart (close HTTP + WS, reload config, re-listen)
// ---------------------------------------------------------------------------

let _nextHandler = null;
let _upgradeHandler = null;
let _restarting = false;

async function restartServer() {
  if (_restarting) return;
  _restarting = true;

  dbg.info('Restarting server (in-process)...');

  // 1. Clear heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // 2. Close all WebSocket connections gracefully
  wsServers.forEach((wss) => {
    wss.clients.forEach((client) => {
      try { client.close(1012, 'Server restarting'); } catch { /* ignore */ }
    });
    wss.close();
  });
  wsServers = [];

  // 3. Close HTTP server
  if (currentServer) {
    await new Promise((resolve) => {
      currentServer.close(() => resolve());
      // Force close after 3 seconds
      setTimeout(resolve, 3000).unref();
    });
    currentServer = null;
  }

  // 4. Reload config and start new server
  serverConfig = loadConfigSync();
  hostname = resolveHostname();
  ALLOWED_ORIGINS = buildAllowedOrigins(hostname, port);

  if (!_nextHandler) {
    _nextHandler = app.getRequestHandler();
    _upgradeHandler = typeof app.getUpgradeHandler === 'function' ? app.getUpgradeHandler() : null;
  }

  await startServer(_nextHandler, _upgradeHandler);
  _restarting = false;
  dbg.info('Server restart complete');
}

// Expose restart function to API routes
globalThis.__restartServer = restartServer;

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

const shutdown = () => {
  dbg.info('shutting down');
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  wsServers.forEach((wss) => {
    wss.clients.forEach((client) => {
      try { client.close(); } catch { /* ignore */ }
    });
    wss.close();
  });
  if (currentServer) {
    currentServer.close(() => process.exit(0));
  }
  setTimeout(() => process.exit(1), 5_000).unref();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

main().catch((err) => {
  dbg.error('fatal error', err);
  process.exit(1);
});
