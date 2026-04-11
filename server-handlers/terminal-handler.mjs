import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { getActiveRoot } from '../src/lib/project/project-context.mjs';
import { createDebug } from '../src/lib/debug.mjs';

const dbg = createDebug('terminal');

const BATCH_INTERVAL_MS = 16;
const MAX_BUFFER_BYTES = 5 * 1024 * 1024;
const PTY_PAUSE_THRESHOLD = 256 * 1024;

function buildPtyEnv() {
  const env = { ...process.env };
  const extra = process.env.CLAUDEGUI_EXTRA_PATH;
  if (extra) {
    const sep = process.platform === 'win32' ? ';' : ':';
    env.PATH = `${extra}${sep}${env.PATH ?? ''}`;
  }
  return env;
}

async function loadPty() {
  try {
    const mod = await import('node-pty');
    return mod.default ?? mod;
  } catch (err) {
    dbg.error('failed to load node-pty', err);
    return null;
  }
}

function defaultShell() {
  if (process.platform === 'win32') return process.env.COMSPEC || 'cmd.exe';
  return process.env.SHELL || '/bin/bash';
}

function sendControl(ws, msg) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* ignore */
  }
}

export default async function terminalHandler(ws, _req) {
  const pty = await loadPty();
  if (!pty) {
    sendControl(ws, {
      type: 'error',
      code: 'PTY_UNAVAILABLE',
      message: 'node-pty is not available on the server',
    });
    ws.close();
    return;
  }

  let cwd;
  try {
    cwd = getActiveRoot();
  } catch {
    cwd = path.resolve(os.homedir());
  }
  const shell = defaultShell();
  dbg.info('spawning PTY', { shell, cwd });
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd,
    env: buildPtyEnv(),
  });

  /** Pending PTY output chunks (as Buffers). */
  const queue = [];
  let bufferedBytes = 0;
  let batchTimer = null;
  let paused = false;
  let ptyPaused = false;
  let killed = false;

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
    if (killed) return;
    killed = true;
    dbg.warn('terminal buffer overflow — killing PTY');
    sendControl(ws, {
      type: 'error',
      code: 'BUFFER_OVERFLOW',
      message: `terminal output buffer exceeded ${MAX_BUFFER_BYTES} bytes`,
    });
    try {
      ptyProcess.kill();
    } catch {
      /* ignore */
    }
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

  ptyProcess.onData((data) => {
    if (killed) return;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
    queue.push(buf);
    bufferedBytes += buf.length;
    if (bufferedBytes > MAX_BUFFER_BYTES) {
      killWithOverflow();
      return;
    }
    maybePausePty();
    if (!paused) scheduleFlush();
  });

  ptyProcess.onExit(({ exitCode }) => {
    dbg.info('PTY exited', { exitCode });
    // Flush anything still queued (if not paused) before announcing exit.
    if (!paused) sendBatch();
    sendControl(ws, { type: 'exit', code: exitCode ?? null });
    if (ws.readyState === ws.OPEN) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  });

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
      default:
        return;
    }
  });

  ws.on('close', () => {
    dbg.log('ws closed, killing PTY');
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    try {
      ptyProcess.kill();
    } catch {
      /* ignore */
    }
  });

  ws.on('error', (err) => {
    dbg.error('ws error', err);
  });
}
