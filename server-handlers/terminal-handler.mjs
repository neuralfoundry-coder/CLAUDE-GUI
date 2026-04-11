import os from 'node:os';
import path from 'node:path';

const BATCH_INTERVAL_MS = 16;

async function loadPty() {
  try {
    const mod = await import('node-pty');
    return mod.default ?? mod;
  } catch (err) {
    console.error('[terminal-handler] failed to load node-pty', err);
    return null;
  }
}

function defaultShell() {
  if (process.platform === 'win32') return process.env.COMSPEC || 'cmd.exe';
  return process.env.SHELL || '/bin/bash';
}

export default async function terminalHandler(ws, _req) {
  const pty = await loadPty();
  if (!pty) {
    ws.send(JSON.stringify({ type: 'error', message: 'node-pty not available' }));
    ws.close();
    return;
  }

  const cwd = path.resolve(process.env.PROJECT_ROOT || os.homedir());
  const ptyProcess = pty.spawn(defaultShell(), [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd,
    env: process.env,
  });

  let batch = [];
  let batchTimer = null;
  let paused = false;

  const flush = () => {
    if (batch.length === 0) return;
    const joined = batch.join('');
    batch = [];
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(joined);
      } catch {
        /* ignore */
      }
    }
  };

  ptyProcess.onData((data) => {
    if (paused) return;
    batch.push(data);
    if (!batchTimer) {
      batchTimer = setTimeout(() => {
        batchTimer = null;
        flush();
      }, BATCH_INTERVAL_MS);
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    flush();
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
      } catch {
        /* ignore */
      }
      ws.close();
    }
  });

  ws.on('message', (raw, isBinary) => {
    if (isBinary) {
      try {
        ptyProcess.write(raw.toString());
      } catch {
        /* ignore */
      }
      return;
    }
    const text = raw.toString();
    try {
      const msg = JSON.parse(text);
      if (msg.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
        ptyProcess.resize(msg.cols, msg.rows);
        return;
      }
      if (msg.type === 'pause') {
        paused = true;
        return;
      }
      if (msg.type === 'resume') {
        paused = false;
        return;
      }
      if (msg.type === 'input' && typeof msg.data === 'string') {
        ptyProcess.write(msg.data);
        return;
      }
    } catch {
      // treat as raw input
      ptyProcess.write(text);
    }
  });

  ws.on('close', () => {
    if (batchTimer) clearTimeout(batchTimer);
    try {
      ptyProcess.kill();
    } catch {
      /* ignore */
    }
  });

  ws.on('error', (err) => {
    console.error('[terminal-handler] ws error', err);
  });
}
