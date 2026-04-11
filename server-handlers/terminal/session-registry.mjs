import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createDebug } from '../../src/lib/debug.mjs';

const dbg = createDebug('terminal-registry');

/**
 * Maximum scrollback replay buffer per session.
 * 256 KB is enough for ~2k lines at 128 cols. Beyond that, reconnect users
 * lose older context — acceptable tradeoff vs keeping an unbounded buffer
 * around for every idle session.
 */
const RING_BUFFER_BYTES = 256 * 1024;

/**
 * How long a detached session (client gone) stays alive before the PTY is
 * killed. 30 minutes covers typical "reload the tab" or "restart the dev
 * server" flows without retaining shells for days.
 */
const GC_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * SessionRecord shape:
 *   {
 *     id: string,
 *     ptyProcess: NodePtyProcess,
 *     cwd: string,
 *     ringBuffer: Buffer[],
 *     ringBytes: number,
 *     persistentListener: () => void | null,
 *     transientListeners: Set<(chunk: Buffer) => void>,
 *     exitListeners: Set<(code: number|null) => void>,
 *     attached: number, // count of currently attached clients (normally 0 or 1)
 *     gcTimer: NodeJS.Timeout | null,
 *     exited: boolean,
 *     exitCode: number | null,
 *   }
 */

class TerminalSessionRegistry {
  constructor() {
    /** @type {Map<string, any>} */
    this.sessions = new Map();
  }

  /**
   * Register a newly-spawned PTY. Installs a persistent onData listener that
   * feeds the ring buffer. Returns the record with its generated id.
   */
  register(ptyProcess, cwd) {
    const id = randomUUID();
    const record = {
      id,
      ptyProcess,
      cwd,
      ringBuffer: [],
      ringBytes: 0,
      transientListeners: new Set(),
      exitListeners: new Set(),
      attached: 0,
      gcTimer: null,
      exited: false,
      exitCode: null,
    };

    ptyProcess.onData((data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
      this.appendOutput(record, buf);
      // Fan out to any transient (attached) listeners.
      for (const listener of record.transientListeners) {
        try {
          listener(buf);
        } catch (err) {
          dbg.error('transient listener failed', err);
        }
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      record.exited = true;
      record.exitCode = exitCode ?? null;
      for (const listener of record.exitListeners) {
        try {
          listener(record.exitCode);
        } catch (err) {
          dbg.error('exit listener failed', err);
        }
      }
      // Schedule cleanup so clients have a chance to receive the exit frame.
      setTimeout(() => {
        if (this.sessions.get(id) === record) {
          this.destroy(id);
        }
      }, 1000);
    });

    this.sessions.set(id, record);
    dbg.info('registered session', { id, cwd });
    return record;
  }

  /** Append output to the ring buffer, trimming oldest chunks if too large. */
  appendOutput(record, chunk) {
    record.ringBuffer.push(chunk);
    record.ringBytes += chunk.length;
    while (record.ringBytes > RING_BUFFER_BYTES && record.ringBuffer.length > 1) {
      const first = record.ringBuffer.shift();
      record.ringBytes -= first.length;
    }
    // A single chunk larger than the buffer: keep only its tail.
    if (record.ringBytes > RING_BUFFER_BYTES && record.ringBuffer.length === 1) {
      const only = record.ringBuffer[0];
      const tail = only.subarray(only.length - RING_BUFFER_BYTES);
      record.ringBuffer[0] = tail;
      record.ringBytes = tail.length;
    }
  }

  get(id) {
    return this.sessions.get(id) ?? null;
  }

  /**
   * Attempt to attach a client to an existing session. Returns the record
   * (and a snapshot Buffer to replay) or null if not found / already gone.
   */
  attach(id) {
    const record = this.sessions.get(id);
    if (!record) return null;
    if (record.gcTimer) {
      clearTimeout(record.gcTimer);
      record.gcTimer = null;
    }
    record.attached += 1;
    const replay = Buffer.concat(record.ringBuffer);
    dbg.info('attached to session', { id, replayBytes: replay.length });
    return { record, replay };
  }

  /**
   * Detach a client (typically on ws close). Starts the GC timer so the PTY
   * is killed after the grace period if no new attachment arrives.
   */
  detach(id) {
    const record = this.sessions.get(id);
    if (!record) return;
    record.attached = Math.max(0, record.attached - 1);
    if (record.attached > 0) return;
    if (record.exited) {
      // Already exited — destroy immediately; the grace period only makes
      // sense for still-alive shells.
      this.destroy(id);
      return;
    }
    if (record.gcTimer) clearTimeout(record.gcTimer);
    record.gcTimer = setTimeout(() => {
      dbg.info('GC expired detached session', { id });
      this.destroy(id);
    }, GC_TIMEOUT_MS);
    dbg.info('detached session', { id, gcInMs: GC_TIMEOUT_MS });
  }

  /** Kill the PTY and remove the record. */
  destroy(id) {
    const record = this.sessions.get(id);
    if (!record) return;
    dbg.info('destroying session', { id });
    try {
      record.ptyProcess.kill();
    } catch {
      /* ignore */
    }
    if (record.gcTimer) {
      clearTimeout(record.gcTimer);
      record.gcTimer = null;
    }
    record.transientListeners.clear();
    record.exitListeners.clear();
    this.sessions.delete(id);
  }

  /** Used by tests to introspect state. */
  size() {
    return this.sessions.size;
  }
}

// Module-level singleton — shared across all terminal handler invocations.
export const terminalSessionRegistry = new TerminalSessionRegistry();

export const TERMINAL_SESSION_CONSTANTS = Object.freeze({
  RING_BUFFER_BYTES,
  GC_TIMEOUT_MS,
});
