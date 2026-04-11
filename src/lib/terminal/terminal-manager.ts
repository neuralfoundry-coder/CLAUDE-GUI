'use client';

/**
 * Singleton that owns xterm.js Terminal instances and their `/ws/terminal`
 * WebSocket connections outside the React component tree.
 *
 * React (`XTerminalAttach`) provides a host `<div>` on mount and requests the
 * manager to attach an existing terminal into it. Tab switches, panel
 * collapse, and font-size changes do not destroy the underlying PTY — the
 * manager simply detaches the xterm DOM subtree and re-attaches it later.
 *
 * Lifetime rules:
 * - A PTY lives from `ensureSession()` until `closeSession()` or a shell exit.
 * - Neither `attach()` nor `detach()` touches the PTY or WebSocket.
 * - Font-size changes mutate `term.options.fontSize` in place; no restart.
 */

import type { Terminal, ITerminalAddon } from '@xterm/xterm';
import type { FitAddon as FitAddonT } from '@xterm/addon-fit';
import { ReconnectingWebSocket } from '@/lib/websocket/reconnecting-ws';
import { useLayoutStore } from '@/stores/use-layout-store';
import { useConnectionStore } from '@/stores/use-connection-store';
import {
  parseServerControlFrame,
  type TerminalClientControl,
  type TerminalServerControl,
} from './terminal-framing';

const HIGH_WATERMARK = 100 * 1024;
const LOW_WATERMARK = 10 * 1024;

export type TerminalInstanceStatus = 'connecting' | 'open' | 'closed' | 'exited';

interface TerminalInstance {
  id: string;
  term: Terminal;
  fitAddon: FitAddonT;
  webglAddon: ITerminalAddon | null;
  ws: ReconnectingWebSocket;
  /** DOM node owned by the manager. xterm is opened into this node once and
   *  we re-parent it into the React host on attach/detach. */
  persistentHost: HTMLDivElement;
  currentHost: HTMLElement | null;
  resizeObserver: ResizeObserver | null;
  status: TerminalInstanceStatus;
  pendingBytes: number;
  paused: boolean;
  lastCols: number;
  lastRows: number;
  opened: boolean;
  exitCode: number | null;
}

type SessionListener = (id: string, status: TerminalInstanceStatus, exitCode: number | null) => void;

class TerminalManager {
  private instances = new Map<string, TerminalInstance>();
  private listeners = new Set<SessionListener>();
  private fontUnsubscribe: (() => void) | null = null;
  private booted = false;

  boot(): void {
    if (this.booted || typeof window === 'undefined') return;
    this.booted = true;
    const initialFont = useLayoutStore.getState().fontSize;
    this.fontUnsubscribe = useLayoutStore.subscribe((state, prev) => {
      if (state.fontSize !== prev.fontSize) {
        this.setFontSize(state.fontSize);
      }
    });
    // Apply initial value in case sessions already exist.
    this.setFontSize(initialFont);
  }

  onSessionChange(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(inst: TerminalInstance): void {
    for (const l of this.listeners) {
      try {
        l(inst.id, inst.status, inst.exitCode);
      } catch {
        /* ignore */
      }
    }
  }

  hasSession(id: string): boolean {
    return this.instances.has(id);
  }

  async ensureSession(id: string): Promise<void> {
    if (typeof window === 'undefined') return;
    if (this.instances.has(id)) return;

    const [xtermMod, fitMod, webglMod, searchMod, linksMod] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/addon-webgl').catch(() => null),
      import('@xterm/addon-search'),
      import('@xterm/addon-web-links'),
    ]);

    // Idempotency guard for concurrent callers.
    if (this.instances.has(id)) return;

    const fontSize = useLayoutStore.getState().fontSize;
    const term = new xtermMod.Terminal({
      cursorBlink: true,
      scrollback: 10000,
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      fontSize,
      theme: { background: '#0a0a0a' },
      allowProposedApi: true,
    });
    const fitAddon = new fitMod.FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new searchMod.SearchAddon());
    term.loadAddon(new linksMod.WebLinksAddon());

    const persistentHost = document.createElement('div');
    persistentHost.className = 'h-full w-full';
    persistentHost.style.height = '100%';
    persistentHost.style.width = '100%';

    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/terminal`;

    const inst: TerminalInstance = {
      id,
      term,
      fitAddon,
      webglAddon: null,
      ws: null as unknown as ReconnectingWebSocket,
      persistentHost,
      currentHost: null,
      resizeObserver: null,
      status: 'connecting',
      pendingBytes: 0,
      paused: false,
      lastCols: term.cols,
      lastRows: term.rows,
      opened: false,
      exitCode: null,
    };

    inst.ws = new ReconnectingWebSocket({
      url,
      onOpen: (ws) => {
        inst.status = 'open';
        useConnectionStore.getState().setStatus('terminal', 'open');
        this.emit(inst);
        const cols = inst.lastCols || term.cols || 120;
        const rows = inst.lastRows || term.rows || 30;
        ws.send(JSON.stringify({ type: 'resize', cols, rows } satisfies TerminalClientControl));
      },
      onClose: () => {
        if (inst.status !== 'exited') {
          inst.status = 'closed';
        }
        useConnectionStore.getState().setStatus('terminal', 'closed');
        this.emit(inst);
      },
      onMessage: (event) => this.handleMessage(inst, event),
    });

    // Webgl addon is loaded lazily on first attach so it has a live canvas.
    if (webglMod && webglMod.WebglAddon) {
      // Stash for later; do not instantiate until we have a sized DOM host.
      (inst as TerminalInstance & { _webglCtor?: typeof webglMod.WebglAddon })._webglCtor =
        webglMod.WebglAddon;
    }

    term.onData((data) => {
      if (inst.ws.readyState !== WebSocket.OPEN) return;
      inst.ws.send(JSON.stringify({ type: 'input', data } satisfies TerminalClientControl));
    });

    this.instances.set(id, inst);
    this.emit(inst);
  }

  private handleMessage(inst: TerminalInstance, event: MessageEvent): void {
    const data = event.data as string | ArrayBuffer;
    if (typeof data === 'string') {
      const control = parseServerControlFrame(data);
      if (control) {
        this.applyServerControl(inst, control);
        return;
      }
      // Unknown text frame — treat as terminal output for resilience.
      this.writePtyChunk(inst, data);
      return;
    }
    // Binary PTY frame.
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(0);
    this.writePtyBytes(inst, bytes);
  }

  private applyServerControl(inst: TerminalInstance, msg: TerminalServerControl): void {
    if (msg.type === 'exit') {
      inst.status = 'exited';
      inst.exitCode = msg.code;
      inst.term.write(`\r\n\x1b[2m[process exited with code ${msg.code ?? '?'}]\x1b[0m\r\n`);
      this.emit(inst);
      return;
    }
    if (msg.type === 'error') {
      inst.term.write(`\r\n\x1b[31m[terminal error: ${msg.message}]\x1b[0m\r\n`);
      return;
    }
  }

  private writePtyBytes(inst: TerminalInstance, bytes: Uint8Array): void {
    const length = bytes.byteLength;
    if (length === 0) return;
    inst.pendingBytes += length;
    inst.term.write(bytes, () => {
      inst.pendingBytes -= length;
      if (inst.paused && inst.pendingBytes < LOW_WATERMARK) {
        this.sendControl(inst, { type: 'resume' });
        inst.paused = false;
      }
    });
    if (!inst.paused && inst.pendingBytes > HIGH_WATERMARK) {
      this.sendControl(inst, { type: 'pause' });
      inst.paused = true;
    }
  }

  private writePtyChunk(inst: TerminalInstance, text: string): void {
    const length = text.length;
    if (length === 0) return;
    inst.pendingBytes += length;
    inst.term.write(text, () => {
      inst.pendingBytes -= length;
      if (inst.paused && inst.pendingBytes < LOW_WATERMARK) {
        this.sendControl(inst, { type: 'resume' });
        inst.paused = false;
      }
    });
    if (!inst.paused && inst.pendingBytes > HIGH_WATERMARK) {
      this.sendControl(inst, { type: 'pause' });
      inst.paused = true;
    }
  }

  private sendControl(inst: TerminalInstance, msg: TerminalClientControl): void {
    if (inst.ws.readyState !== WebSocket.OPEN) return;
    inst.ws.send(JSON.stringify(msg));
  }

  attach(id: string, host: HTMLElement): void {
    const inst = this.instances.get(id);
    if (!inst || typeof window === 'undefined') return;

    // Move persistent host into the React-provided container.
    if (inst.persistentHost.parentElement !== host) {
      host.appendChild(inst.persistentHost);
    }
    inst.currentHost = host;

    // First-time DOM open.
    if (!inst.opened) {
      inst.term.open(inst.persistentHost);
      inst.opened = true;

      // Load WebGL addon now that there is a real canvas to paint onto.
      const webglCtor = (inst as TerminalInstance & { _webglCtor?: new () => ITerminalAddon })
        ._webglCtor;
      if (webglCtor) {
        try {
          const addon = new webglCtor();
          inst.term.loadAddon(addon);
          inst.webglAddon = addon;
        } catch {
          inst.webglAddon = null;
        }
      }
    }

    this.observe(inst);
    this.scheduleFit(inst);
    inst.term.focus();
  }

  detach(id: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;
    if (inst.resizeObserver) {
      try {
        inst.resizeObserver.disconnect();
      } catch {
        /* ignore */
      }
      inst.resizeObserver = null;
    }
    if (inst.persistentHost.parentElement) {
      try {
        inst.persistentHost.parentElement.removeChild(inst.persistentHost);
      } catch {
        /* ignore */
      }
    }
    inst.currentHost = null;
  }

  activate(id: string): void {
    const inst = this.instances.get(id);
    if (!inst || !inst.currentHost) return;
    this.scheduleFit(inst);
    inst.term.focus();
  }

  setFontSize(px: number): void {
    for (const inst of this.instances.values()) {
      inst.term.options.fontSize = px;
      this.scheduleFit(inst);
    }
  }

  closeSession(id: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;
    this.detach(id);
    try {
      inst.ws.close();
    } catch {
      /* ignore */
    }
    try {
      inst.term.dispose();
    } catch {
      /* ignore */
    }
    this.instances.delete(id);
  }

  dispose(): void {
    for (const id of Array.from(this.instances.keys())) {
      this.closeSession(id);
    }
    this.fontUnsubscribe?.();
    this.fontUnsubscribe = null;
    this.booted = false;
  }

  private observe(inst: TerminalInstance): void {
    if (!inst.currentHost) return;
    if (inst.resizeObserver) return;
    const observer = new ResizeObserver(() => this.scheduleFit(inst));
    try {
      observer.observe(inst.currentHost);
      inst.resizeObserver = observer;
    } catch {
      inst.resizeObserver = null;
    }
  }

  private scheduleFit(inst: TerminalInstance, attempt = 0): void {
    if (!inst.currentHost || !inst.opened) return;
    requestAnimationFrame(() => {
      if (!inst.currentHost) return;
      const { clientWidth, clientHeight } = inst.currentHost;
      if (clientWidth === 0 || clientHeight === 0) {
        if (attempt < 10) this.scheduleFit(inst, attempt + 1);
        return;
      }
      try {
        inst.fitAddon.fit();
      } catch {
        return;
      }
      const cols = inst.term.cols;
      const rows = inst.term.rows;
      if (cols !== inst.lastCols || rows !== inst.lastRows) {
        inst.lastCols = cols;
        inst.lastRows = rows;
        this.sendControl(inst, { type: 'resize', cols, rows });
      }
    });
  }
}

let singleton: TerminalManager | null = null;

export function getTerminalManager(): TerminalManager {
  if (!singleton) singleton = new TerminalManager();
  return singleton;
}

export const terminalManager = getTerminalManager();

if (typeof window !== 'undefined') {
  const hot = (import.meta as ImportMeta & { hot?: { dispose: (cb: () => void) => void } }).hot;
  hot?.dispose(() => {
    try {
      terminalManager.dispose();
    } catch {
      /* ignore */
    }
  });
}
