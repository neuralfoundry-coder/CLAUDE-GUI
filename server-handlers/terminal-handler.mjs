import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import url from 'node:url';
import { Buffer } from 'node:buffer';
import { getActiveRoot } from '../src/lib/project/project-context.mjs';
import { browserSessionRegistry } from '../src/lib/project/browser-session-registry.mjs';
import { createDebug } from '../src/lib/debug.mjs';
import { resolveShell, buildPtyEnv } from './terminal/shell-resolver.mjs';
import { terminalSessionRegistry } from './terminal/session-registry.mjs';

const dbg = createDebug('terminal');

const BATCH_INTERVAL_MS = 16;
const MAX_BUFFER_BYTES = 5 * 1024 * 1024;
const PTY_PAUSE_THRESHOLD = 256 * 1024;

async function loadPty() {
  try {
    const mod = await import('node-pty');
    return mod.default ?? mod;
  } catch (err) {
    dbg.error('failed to load node-pty', err);
    return null;
  }
}

function sendControl(ws, msg) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* ignore */
  }
}

/**
 * Resolve the initial PTY cwd. Order of preference:
 *   1. `?cwd=<path>` query param on the WebSocket upgrade URL (if it resolves
 *      to a real directory inside the active project root — checked via
 *      `resolveSafe`-equivalent here). Used by "Open terminal here".
 *   2. The current ProjectContext active root (`getActiveRoot()`).
 *   3. The user's home directory.
 */
function resolveInitialCwd(req) {
  const browserId = req?.browserId || null;
  const fallback = () => {
    const root = browserSessionRegistry.getRoot(browserId);
    return root ?? path.resolve(os.homedir());
  };
  try {
    if (!req || !req.url) return fallback();
    const parsed = url.parse(req.url, true);
    const raw = parsed.query?.cwd;
    if (typeof raw !== 'string' || raw.length === 0) return fallback();
    const root = browserSessionRegistry.getRoot(browserId);
    const abs = path.isAbsolute(raw) ? path.resolve(raw) : root ? path.resolve(root, raw) : null;
    if (!abs) return fallback();
    if (root && !(abs === root || abs.startsWith(root + path.sep))) {
      dbg.warn('reject cwd outside project root', { raw, abs, root });
      return fallback();
    }
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) return path.dirname(abs);
    return abs;
  } catch (err) {
    dbg.warn('cwd query resolution failed', err);
    return fallback();
  }
}

function parseQuerySessionId(req) {
  try {
    if (!req || !req.url) return null;
    const parsed = url.parse(req.url, true);
    const raw = parsed.query?.sessionId;
    if (typeof raw === 'string' && raw.length > 0) return raw;
    return null;
  } catch {
    return null;
  }
}

/**
 * Spawn a fresh PTY and register it in the session registry. Returns the
 * session record.
 */
async function createNewSession(req) {
  const pty = await loadPty();
  if (!pty) return null;
  const cwd = resolveInitialCwd(req);
  const { shell, args: shellArgs } = resolveShell();
  const env = buildPtyEnv(shell);
  dbg.info('spawning PTY', { shell, shellArgs, cwd });
  let ptyProcess;
  try {
    ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env,
    });
  } catch (err) {
    dbg.error('PTY spawn failed', err);
    return null;
  }
  const record = terminalSessionRegistry.register(ptyProcess, cwd);

  // Inject an OSC 7 cwd emitter into the shell so the client can track the
  // working directory. The snippet is written directly to PTY stdin followed
  // by `clear` so the echoed text is wiped before the user sees it. A leading
  // space keeps the command out of shell history (HISTCONTROL=ignorespace).
  const osc7Snippet =
    ' if [ -n "${ZSH_VERSION-}" ]; then ' +
    '_cgui_osc7(){ printf "\\033]7;file://%s%s\\033\\\\" "${HOST:-$(hostname)}" "$PWD"; }; ' +
    'typeset -ga precmd_functions; precmd_functions+=(_cgui_osc7); _cgui_osc7; ' +
    'elif [ -n "${BASH_VERSION-}" ]; then ' +
    '_cgui_osc7(){ printf "\\033]7;file://%s%s\\033\\\\" "${HOSTNAME:-$(hostname)}" "$PWD"; }; ' +
    'PROMPT_COMMAND="_cgui_osc7${PROMPT_COMMAND:+;$PROMPT_COMMAND}"; _cgui_osc7; ' +
    'fi; clear\r';
  // Use a short delay to allow the PTY process to fully initialize its
  // stdin pipe before we write, then flush the ring buffer so the echoed
  // snippet is not replayed to clients that connect later.
  setTimeout(() => {
    try {
      ptyProcess.write(osc7Snippet);
    } catch { /* PTY may have already exited */ }
    // Give the shell time to process the snippet and the `clear` command,
    // then reset the ring buffer so the init noise is not replayed.
    setTimeout(() => {
      record.ringBuffer.length = 0;
      record.ringBytes = 0;
    }, 800);
  }, 100);

  return record;
}

export default async function terminalHandler(ws, req) {
  // 1. Try to re-attach to an existing session if the client supplied an id.
  const requestedId = parseQuerySessionId(req);
  let record = null;
  let replay = null;
  let replayed = false;
  if (requestedId) {
    const attached = terminalSessionRegistry.attach(requestedId);
    if (attached) {
      record = attached.record;
      replay = attached.replay;
    } else {
      dbg.info('requested session not found, creating new', { requestedId });
    }
  }

  // 2. No session found — spawn a new one.
  if (!record) {
    record = await createNewSession(req);
    if (!record) {
      sendControl(ws, {
        type: 'error',
        code: 'PTY_UNAVAILABLE',
        message: 'node-pty is not available on the server',
      });
      ws.close();
      return;
    }
    // `attach` only increments the counter — do it so detach() sees the right
    // reference count.
    terminalSessionRegistry.attach(record.id);
  }

  const { ptyProcess } = record;
  const sessionId = record.id;
  let explicitlyClosed = false;
  let detached = false;

  // Announce the authoritative session ID to the client.
  sendControl(ws, { type: 'session', id: sessionId, replay: Boolean(replay && replay.length > 0) });

  // If we had a replay buffer, ship it as a single binary frame BEFORE
  // installing the transient listener. Node's single-threaded model means
  // no onData can fire between our snapshot and the listener install.
  if (replay && replay.length > 0 && ws.readyState === ws.OPEN) {
    try {
      ws.send(replay, { binary: true });
      replayed = true;
    } catch (err) {
      dbg.error('replay send failed', err);
    }
  }

  // ── Per-attachment state ────────────────────────────────────────────
  /** Pending PTY output chunks (as Buffers). */
  const queue = [];
  let bufferedBytes = 0;
  let batchTimer = null;
  let paused = false;
  let ptyPaused = false;

  const sendBatch = () => {
    if (queue.length === 0) return;
    const merged = queue.length === 1 ? queue[0] : Buffer.concat(queue);
    queue.length = 0;
    bufferedBytes = 0;
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(merged, { binary: true });
      } catch (err) {
        dbg.error('ws.send failed', err);
      }
    }
  };

  const scheduleFlush = () => {
    if (batchTimer) return;
    batchTimer = setTimeout(() => {
      batchTimer = null;
      if (!paused) sendBatch();
    }, BATCH_INTERVAL_MS);
  };

  const killWithOverflow = () => {
    dbg.warn('terminal buffer overflow — destroying session');
    sendControl(ws, {
      type: 'error',
      code: 'BUFFER_OVERFLOW',
      message: `terminal output buffer exceeded ${MAX_BUFFER_BYTES} bytes`,
    });
    terminalSessionRegistry.destroy(sessionId);
    if (ws.readyState === ws.OPEN) {
      try {
        ws.close(1011, 'buffer overflow');
      } catch {
        /* ignore */
      }
    }
  };

  const maybePausePty = () => {
    if (ptyPaused) return;
    if (bufferedBytes < PTY_PAUSE_THRESHOLD) return;
    try {
      if (typeof ptyProcess.pause === 'function') {
        ptyProcess.pause();
        ptyPaused = true;
      }
    } catch {
      /* ignore */
    }
  };

  const maybeResumePty = () => {
    if (!ptyPaused) return;
    try {
      if (typeof ptyProcess.resume === 'function') {
        ptyProcess.resume();
        ptyPaused = false;
      }
    } catch {
      /* ignore */
    }
  };

  // ── Transient data listener ─────────────────────────────────────────
  const onChunk = (buf) => {
    if (explicitlyClosed || detached) return;
    queue.push(buf);
    bufferedBytes += buf.length;
    if (bufferedBytes > MAX_BUFFER_BYTES) {
      killWithOverflow();
      return;
    }
    maybePausePty();
    if (!paused) scheduleFlush();
  };
  record.transientListeners.add(onChunk);

  // ── Exit listener (propagate `{type:'exit'}` to the client) ─────────
  const onExit = (code) => {
    if (detached) return;
    if (!paused) sendBatch();
    sendControl(ws, { type: 'exit', code: code ?? null });
    if (ws.readyState === ws.OPEN) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  };
  record.exitListeners.add(onExit);

  // If the session already exited before we attached (edge case: GC race),
  // fire the exit notification synchronously.
  if (record.exited) {
    queueMicrotask(() => onExit(record.exitCode));
  }

  // ── Incoming messages from the client ───────────────────────────────
  ws.on('message', (raw, isBinary) => {
    if (isBinary) {
      // Legacy path: raw keystrokes as binary. Retained for compatibility.
      try {
        ptyProcess.write(raw.toString());
      } catch {
        /* ignore */
      }
      return;
    }
    const text = raw.toString();
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      // Fallback: treat unparseable text as raw input.
      try {
        ptyProcess.write(text);
      } catch {
        /* ignore */
      }
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'resize': {
        if (typeof msg.cols === 'number' && typeof msg.rows === 'number') {
          try {
            ptyProcess.resize(Math.max(1, msg.cols | 0), Math.max(1, msg.rows | 0));
          } catch {
            /* ignore */
          }
        }
        return;
      }
      case 'pause': {
        paused = true;
        return;
      }
      case 'resume': {
        paused = false;
        maybeResumePty();
        sendBatch();
        return;
      }
      case 'input': {
        if (typeof msg.data === 'string') {
          try {
            ptyProcess.write(msg.data);
          } catch {
            /* ignore */
          }
        }
        return;
      }
      case 'close': {
        // Explicit destroy from the client (tab close button).
        explicitlyClosed = true;
        record.transientListeners.delete(onChunk);
        record.exitListeners.delete(onExit);
        terminalSessionRegistry.destroy(sessionId);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        return;
      }
      default:
        return;
    }
  });

  ws.on('close', () => {
    if (detached) return;
    detached = true;
    dbg.log('ws closed — detaching session', { id: sessionId, explicitlyClosed });
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    record.transientListeners.delete(onChunk);
    record.exitListeners.delete(onExit);
    if (explicitlyClosed) return; // already destroyed in the message handler
    terminalSessionRegistry.detach(sessionId);
  });

  ws.on('error', (err) => {
    dbg.error('ws error', err);
  });

  // Silence `replayed` lint: the variable is retained for future telemetry.
  void replayed;
}
