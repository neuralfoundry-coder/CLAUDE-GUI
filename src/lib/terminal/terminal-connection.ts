'use client';

/**
 * WebSocket connection for a single terminal session.
 *
 * Handles: connect, auto-reconnect with exponential backoff, input queuing
 * during transient states, input chunking for large pastes, and backpressure
 * flow control signaling.
 *
 * Absorbs the former `terminal-socket.ts`.
 */

import type { TerminalClientControl, TerminalServerControl } from './terminal-framing';
import { parseServerControlFrame } from './terminal-framing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INPUT_CHUNK_SIZE = 4 * 1024;
const INPUT_QUEUE_MAX_BYTES = 32 * 1024;
const CONNECT_TIMEOUT_MS = 15_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface TerminalConnectionConfig {
  baseUrl: string;
  browserId: string;
  initialCwd: string | null;
  onPtyData: (data: Uint8Array) => void;
  onPtyText: (text: string) => void;
  onControl: (msg: TerminalServerControl) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

// ---------------------------------------------------------------------------
// TerminalConnection
// ---------------------------------------------------------------------------

export class TerminalConnection {
  private ws: WebSocket | null = null;
  private config: TerminalConnectionConfig;
  private _status: ConnectionStatus = 'connecting';
  private _serverSessionId: string | null = null;
  private _disposed = false;

  // Reconnection state
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  // Input queue (buffered while not OPEN)
  private inputQueue: string[] = [];
  private inputQueueBytes = 0;

  constructor(config: TerminalConnectionConfig) {
    this.config = config;
    this.connect();
  }

  // ── Public API ────────────────────────────────────────────────────────

  get status(): ConnectionStatus { return this._status; }
  get serverSessionId(): string | null { return this._serverSessionId; }

  setServerSessionId(id: string): void {
    this._serverSessionId = id;
  }

  sendInput(data: string): void {
    if (!data) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queueInput(data);
      return;
    }
    if (data.length <= INPUT_CHUNK_SIZE) {
      this.sendJson({ type: 'input', data });
      return;
    }
    // Chunk large pastes to avoid stalling the socket.
    const chunks: string[] = [];
    for (let i = 0; i < data.length; i += INPUT_CHUNK_SIZE) {
      chunks.push(data.slice(i, i + INPUT_CHUNK_SIZE));
    }
    const flushNext = (index: number) => {
      if (index >= chunks.length || this._disposed) return;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.sendJson({ type: 'input', data: chunks[index]! });
      queueMicrotask(() => flushNext(index + 1));
    };
    flushNext(0);
  }

  sendResize(cols: number, rows: number): void {
    this.sendJson({ type: 'resize', cols, rows });
  }

  sendPause(): void {
    this.sendJson({ type: 'pause' });
  }

  sendResume(): void {
    this.sendJson({ type: 'resume' });
  }

  /** Explicit PTY kill — server destroys the session immediately. */
  sendClose(): void {
    this.sendJson({ type: 'close' });
  }

  /** Disconnect without killing the server-side PTY (allows reconnect). */
  close(): void {
    this.clearTimers();
    this._disposed = true;
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }

  /** Give up and clean up all resources. */
  dispose(): void {
    this.close();
  }

  /** Reset connection for a restart (new PTY). */
  restart(): void {
    this.clearTimers();
    this._disposed = false;
    this._serverSessionId = null;
    this.reconnectAttempts = 0;
    this.inputQueue.length = 0;
    this.inputQueueBytes = 0;
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
    this.setStatus('connecting');
    this.connect();
  }

  // ── Connection lifecycle ──────────────────────────────────────────────

  private connect(): void {
    if (this._disposed) return;

    const params: string[] = [`browserId=${encodeURIComponent(this.config.browserId)}`];
    if (this._serverSessionId) {
      params.push(`sessionId=${encodeURIComponent(this._serverSessionId)}`);
    } else if (this.config.initialCwd) {
      params.push(`cwd=${encodeURIComponent(this.config.initialCwd)}`);
    }
    const url = `${this.config.baseUrl}?${params.join('&')}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.setStatus('closed');
      return;
    }
    this.ws.binaryType = 'arraybuffer';

    this.ws.addEventListener('open', () => {
      this.clearConnectTimer();
      this.reconnectAttempts = 0;
      this.setStatus('open');
      this.flushInputQueue();
    });

    this.ws.addEventListener('message', (event) => this.handleMessage(event));

    this.ws.addEventListener('error', () => {
      /* logged in close handler */
    });

    this.ws.addEventListener('close', () => {
      this.clearConnectTimer();
      if (this._disposed) return;
      if (this._status === 'open' || this._status === 'connecting') {
        this.attemptReconnect();
      }
    });

    // Safety: force-close if handshake hangs.
    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      if (this._status === 'connecting' || this._status === 'reconnecting') {
        try { this.ws?.close(); } catch { /* ignore */ }
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private attemptReconnect(): void {
    if (this._disposed) return;
    // Only reconnect if we have a server session to reattach to.
    if (!this._serverSessionId) {
      this.setStatus('closed');
      return;
    }
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.setStatus('closed');
      return;
    }
    this.reconnectAttempts++;
    this.setStatus('reconnecting');
    const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, this.reconnectAttempts - 1), BACKOFF_CAP_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  // ── Message dispatch ──────────────────────────────────────────────────

  private handleMessage(event: MessageEvent): void {
    const data = event.data as string | ArrayBuffer;
    if (typeof data === 'string') {
      const control = parseServerControlFrame(data);
      if (control) {
        this.config.onControl(control);
        return;
      }
      // Unknown text frame — treat as terminal output.
      this.config.onPtyText(data);
      return;
    }
    // Binary PTY data.
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(0);
    if (bytes.byteLength > 0) {
      this.config.onPtyData(bytes);
    }
  }

  // ── Input queue ───────────────────────────────────────────────────────

  private queueInput(data: string): void {
    this.inputQueue.push(data);
    this.inputQueueBytes += data.length;
    while (this.inputQueueBytes > INPUT_QUEUE_MAX_BYTES && this.inputQueue.length > 0) {
      const evicted = this.inputQueue.shift()!;
      this.inputQueueBytes -= evicted.length;
    }
  }

  private flushInputQueue(): void {
    if (this.inputQueue.length === 0) return;
    for (const chunk of this.inputQueue) {
      this.sendInput(chunk);
    }
    this.inputQueue.length = 0;
    this.inputQueueBytes = 0;
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private sendJson(msg: TerminalClientControl): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch { /* ignore */ }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.config.onStatusChange(status);
  }

  private clearTimers(): void {
    this.clearConnectTimer();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }
}
