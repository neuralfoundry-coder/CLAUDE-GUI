'use client';

/**
 * Orchestrates a single terminal session by wiring a TerminalInstance (xterm
 * rendering) and a TerminalConnection (WebSocket transport) together.
 *
 * Handles: server control frame dispatch, OSC 7 cwd tracking, backpressure
 * flow control with pending-bytes accounting, restart logic, and status
 * lifecycle.
 */

import { TerminalInstance, type TerminalInstanceConfig, type ReservedKeyPredicate, type FileLinkHandler } from './terminal-instance';
import { TerminalConnection, type ConnectionStatus } from './terminal-connection';
import type { TerminalServerControl } from './terminal-framing';
import type { ITheme } from '@xterm/xterm';
import type { ISearchOptions } from '@xterm/addon-search';
import type { XtermModules } from './terminal-instance';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HIGH_WATERMARK = 100 * 1024;
const LOW_WATERMARK = 10 * 1024;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'exited';

export interface SessionControllerConfig {
  id: string;
  initialCwd: string | null;
  baseUrl: string;
  browserId: string;
  fontSize: number;
  fontFamily: string;
  theme: ITheme;
  reservedKeyPredicate: ReservedKeyPredicate | null;
  fileLinkHandler: FileLinkHandler | null;
  copyOnSelect: boolean;
  onStatusChange: (status: SessionStatus, exitCode: number | null) => void;
  onCwdChange: (cwd: string | null) => void;
  onActivity: () => void;
  onBackpressureChange: (paused: boolean) => void;
}

// ---------------------------------------------------------------------------
// TerminalSessionController
// ---------------------------------------------------------------------------

export class TerminalSessionController {
  readonly id: string;
  private instance: TerminalInstance;
  private connection: TerminalConnection;
  private config: SessionControllerConfig;
  private _status: SessionStatus = 'connecting';
  private _exitCode: number | null = null;
  private _backpressured = false;
  private pendingBytes = 0;

  constructor(modules: XtermModules, config: SessionControllerConfig) {
    this.id = config.id;
    this.config = config;

    // Create xterm instance (rendering layer).
    const instConfig: TerminalInstanceConfig = {
      fontSize: config.fontSize,
      fontFamily: config.fontFamily,
      theme: config.theme,
      reservedKeyPredicate: config.reservedKeyPredicate,
      fileLinkHandler: config.fileLinkHandler,
      copyOnSelect: config.copyOnSelect,
      onData: (data) => this.connection.sendInput(data),
      onActivity: () => config.onActivity(),
      onCwdChange: (cwd) => config.onCwdChange(cwd),
    };
    this.instance = new TerminalInstance(modules, instConfig);

    // Notify server when terminal resizes.
    this.instance.onResize((cols, rows) => {
      this.connection.sendResize(cols, rows);
    });

    // Create WebSocket connection (transport layer).
    this.connection = new TerminalConnection({
      baseUrl: config.baseUrl,
      browserId: config.browserId,
      initialCwd: config.initialCwd,
      onPtyData: (bytes) => this.handlePtyData(bytes),
      onPtyText: (text) => this.handlePtyText(text),
      onControl: (msg) => this.handleServerControl(msg),
      onStatusChange: (connStatus) => this.handleConnectionStatusChange(connStatus),
    });
  }

  // ── Public API ────────────────────────────────────────────────────────

  get status(): SessionStatus { return this._status; }
  get cwd(): string | null { return this.instance.cwd; }
  get exitCode(): number | null { return this._exitCode; }
  get serverSessionId(): string | null { return this.connection.serverSessionId; }
  get isBackpressured(): boolean { return this._backpressured; }

  // DOM
  attach(host: HTMLElement): void {
    this.instance.attach(host);
  }

  detach(): void {
    this.instance.detach();
  }

  activate(): void {
    this.instance.fit();
    this.instance.focus();
  }

  // Lifecycle
  restart(): void {
    if (this._status !== 'closed' && this._status !== 'exited') return;

    const now = new Date();
    const ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
    this.instance.writeln(`\x1b[2m─── restarted at ${ts} ───\x1b[0m`);

    this.pendingBytes = 0;
    this._backpressured = false;
    this._exitCode = null;
    this._status = 'connecting';
    this.config.onStatusChange('connecting', null);
    this.config.onBackpressureChange(false);

    this.connection.restart();
  }

  close(): void {
    this.connection.sendClose();
    this.connection.dispose();
    this.instance.detach();
    this.instance.dispose();
  }

  dispose(): void {
    this.connection.dispose();
    this.instance.detach();
    this.instance.dispose();
  }

  // Appearance
  setFontSize(px: number): void { this.instance.setFontSize(px); }
  setTheme(theme: ITheme): void { this.instance.setTheme(theme); }
  setFontFamily(family: string): void { this.instance.setFontFamily(family); }

  // Search
  findNext(query: string, opts?: ISearchOptions): boolean { return this.instance.findNext(query, opts); }
  findPrevious(query: string, opts?: ISearchOptions): boolean { return this.instance.findPrevious(query, opts); }
  clearSearch(): void { this.instance.clearSearch(); }

  // Selection / clipboard
  hasSelection(): boolean { return this.instance.hasSelection(); }
  getSelection(): string { return this.instance.getSelection(); }
  selectAll(): void { this.instance.selectAll(); }
  paste(text: string): void { this.connection.sendInput(text); }
  clearBuffer(): void { this.instance.clear(); }

  // ── Server control dispatch ───────────────────────────────────────────

  private handleServerControl(msg: TerminalServerControl): void {
    switch (msg.type) {
      case 'exit':
        this._status = 'exited';
        this._exitCode = msg.code;
        this.instance.writeln(`\x1b[2m[process exited with code ${msg.code ?? '?'}]\x1b[0m`);
        this.config.onStatusChange('exited', msg.code);
        break;

      case 'error':
        this.instance.writeln(`\x1b[31m[terminal error: ${msg.message}]\x1b[0m`);
        if (this._status === 'connecting') {
          this._status = 'closed';
          this.config.onStatusChange('closed', null);
        }
        break;

      case 'session': {
        const prevId = this.connection.serverSessionId;
        if (prevId && prevId !== msg.id) {
          this.instance.writeln(
            '\x1b[2m[previous session was evicted — started a fresh shell]\x1b[0m',
          );
        }
        this.connection.setServerSessionId(msg.id);
        if (msg.replay) {
          this.instance.clear();
        }
        break;
      }

      default:
        break;
    }
  }

  // ── Connection status mapping ─────────────────────────────────────────

  private handleConnectionStatusChange(connStatus: ConnectionStatus): void {
    // Map ConnectionStatus to SessionStatus (connection is a subset).
    switch (connStatus) {
      case 'open':
        if (this._status !== 'exited') {
          this._status = 'open';
          // Send initial resize now that connection is ready.
          this.connection.sendResize(this.instance.lastCols, this.instance.lastRows);
          this.config.onStatusChange('open', null);
        }
        break;

      case 'reconnecting':
        if (this._status === 'open') {
          this._status = 'reconnecting';
          this.instance.writeln(
            '\x1b[33m[connection lost — attempting to reconnect...]\x1b[0m',
          );
          this.config.onStatusChange('reconnecting', null);
        }
        break;

      case 'closed':
        if (this._status !== 'exited') {
          this._status = 'closed';
          this.instance.writeln(
            '\x1b[2m[connection to PTY lost — press Restart to spawn a new shell]\x1b[0m',
          );
          this.config.onStatusChange('closed', null);
        }
        break;

      case 'connecting':
        // No status change for initial connect (already set in constructor).
        break;
    }
  }

  // ── Backpressure ──────────────────────────────────────────────────────

  private async handlePtyData(bytes: Uint8Array): Promise<void> {
    const length = bytes.byteLength;
    if (length === 0) return;
    this.pendingBytes += length;

    // Pause server if we're accumulating too fast.
    if (!this._backpressured && this.pendingBytes > HIGH_WATERMARK) {
      this.connection.sendPause();
      this._backpressured = true;
      this.config.onBackpressureChange(true);
    }

    await this.instance.write(bytes);
    this.pendingBytes -= length;

    // Resume server when buffer drains.
    if (this._backpressured && this.pendingBytes < LOW_WATERMARK) {
      this.connection.sendResume();
      this._backpressured = false;
      this.config.onBackpressureChange(false);
    }

    this.config.onActivity();
  }

  private async handlePtyText(text: string): Promise<void> {
    const length = text.length;
    if (length === 0) return;
    this.pendingBytes += length;

    if (!this._backpressured && this.pendingBytes > HIGH_WATERMARK) {
      this.connection.sendPause();
      this._backpressured = true;
      this.config.onBackpressureChange(true);
    }

    await this.instance.write(text);
    this.pendingBytes -= length;

    if (this._backpressured && this.pendingBytes < LOW_WATERMARK) {
      this.connection.sendResume();
      this._backpressured = false;
      this.config.onBackpressureChange(false);
    }

    this.config.onActivity();
  }
}
