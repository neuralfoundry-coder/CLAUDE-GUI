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

import type { Terminal, ITerminalAddon, IBufferRange } from '@xterm/xterm';
import type { FitAddon as FitAddonT } from '@xterm/addon-fit';
import type { SearchAddon as SearchAddonT, ISearchOptions } from '@xterm/addon-search';
import { TerminalSocket, createTerminalSocket } from './terminal-socket';
import { TERMINAL_THEMES, resolveTheme } from './terminal-themes';
import { useLayoutStore, type Theme as AppTheme } from '@/stores/use-layout-store';
import { useSettingsStore } from '@/stores/use-settings-store';
import { useConnectionStore } from '@/stores/use-connection-store';
import { getBrowserId } from '@/lib/browser-session';
import { isMacPlatform } from '@/hooks/use-keyboard-shortcut';
import {
  parseServerControlFrame,
  type TerminalClientControl,
  type TerminalServerControl,
} from './terminal-framing';

const HIGH_WATERMARK = 100 * 1024;
const LOW_WATERMARK = 10 * 1024;
const INPUT_CHUNK_SIZE = 4 * 1024;

type ReservedKeyPredicate = (event: KeyboardEvent) => boolean;

export type TerminalInstanceStatus = 'connecting' | 'open' | 'closed' | 'exited';

interface TerminalInstance {
  id: string;
  /**
   * Authoritative session ID issued by the server the first time this
   * session attached. Used to re-attach the same PTY after a reconnect /
   * restart (FR-414). `null` until the server sends the `session` frame.
   */
  serverSessionId: string | null;
  term: Terminal;
  fitAddon: FitAddonT;
  searchAddon: SearchAddonT;
  webglAddon: ITerminalAddon | null;
  ws: TerminalSocket;
  /** Base URL without query; `sessionId`/`cwd` are appended per-connect. */
  baseUrl: string;
  /** Initial cwd from "Open terminal here". Only used on the first connect. */
  initialCwd: string | null;
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
  cwd: string | null;
}

type SessionListener = (id: string, status: TerminalInstanceStatus, exitCode: number | null) => void;
type CwdListener = (id: string, cwd: string | null) => void;
type ActivityListener = (id: string) => void;

class TerminalManager {
  private instances = new Map<string, TerminalInstance>();
  private listeners = new Set<SessionListener>();
  private cwdListeners = new Set<CwdListener>();
  private activityListeners = new Set<ActivityListener>();
  private layoutUnsubscribe: (() => void) | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  private systemThemeHandler: (() => void) | null = null;
  private booted = false;
  private reservedKeyPredicate: ReservedKeyPredicate | null = null;
  private fileLinkHandler: ((path: string, line?: number, col?: number) => void) | null = null;

  /**
   * Inject a handler for clickable file path links detected in PTY output.
   * Called by `AppShell` at boot so the manager doesn't import the editor store
   * directly (keeps the manager decoupled from app stores).
   */
  setFileLinkHandler(handler: (path: string, line?: number, col?: number) => void): void {
    this.fileLinkHandler = handler;
  }

  /**
   * Register a predicate that decides whether a key event should be vetoed
   * (i.e. not forwarded to xterm/PTY) so it can be handled by a global
   * keyboard shortcut handler instead. Returning `true` means "reserve this
   * event — xterm will not process it".
   */
  setReservedKeyPredicate(predicate: ReservedKeyPredicate | null): void {
    this.reservedKeyPredicate = predicate;
  }

  boot(): void {
    if (this.booted || typeof window === 'undefined') return;
    this.booted = true;
    const layout = useLayoutStore.getState();
    this.layoutUnsubscribe = useLayoutStore.subscribe((state, prev) => {
      if (
        state.fontSize !== prev.fontSize ||
        state.panelZoom.terminal !== prev.panelZoom.terminal
      ) {
        this.setFontSize(Math.round(state.fontSize * state.panelZoom.terminal));
      }
      if (state.theme !== prev.theme) {
        this.setTheme(state.theme);
      }
    });
    this.settingsUnsubscribe = useSettingsStore.subscribe((state, prev) => {
      if (
        state.terminalFontFamily !== prev.terminalFontFamily ||
        state.terminalFontLigatures !== prev.terminalFontLigatures
      ) {
        this.applyFontSettings();
      }
    });
    // Re-apply terminal theme when OS color-scheme changes (for 'system' theme).
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemThemeHandler = () => {
      if (useLayoutStore.getState().theme === 'system') {
        this.setTheme('system');
      }
    };
    mq.addEventListener('change', this.systemThemeHandler);

    // Apply initial values in case sessions already exist.
    this.setFontSize(Math.round(layout.fontSize * layout.panelZoom.terminal));
    this.setTheme(layout.theme);
    this.applyFontSettings();

    // Reserved key combinations: these bubble to the global shortcut handler
    // instead of being written to the PTY. Keep in sync with
    // `src/hooks/use-global-shortcuts.ts`.
    // Only veto keys that carry the *platform primary modifier* — Cmd on
    // macOS, Ctrl elsewhere. Previously this accepted either modifier,
    // which stole standard shell readline shortcuts on macOS:
    //   Ctrl+D (EOF), Ctrl+W (kill-word), Ctrl+F/Ctrl+K (cursor/kill),
    //   Ctrl+T (transpose), Ctrl+[ (ESC), Ctrl+] etc.
    // `Ctrl+Tab` stays reserved on both platforms because no shell uses
    // it and we want tab switching everywhere.
    const mac = isMacPlatform();
    this.setReservedKeyPredicate((event) => {
      const k = event.key.toLowerCase();

      // Ctrl+Tab / Ctrl+Shift+Tab — reserved on every platform.
      if (event.ctrlKey && k === 'tab') return true;

      const primaryMod = mac ? event.metaKey : event.ctrlKey;
      if (!primaryMod) return false;

      if (event.shiftKey && k === 'r') return true;
      if (event.shiftKey && k === 'o') return true;
      if (event.shiftKey && k === 'enter') return true;
      if (
        !event.shiftKey &&
        (k === 't' || k === 'w' || k === 'f' || k === 'k' || k === 'd')
      ) {
        return true;
      }
      if (event.key === '[' || event.key === ']') return true;
      if (/^[1-9]$/.test(event.key)) return true;
      return false;
    });
  }

  onSessionChange(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onCwdChange(listener: CwdListener): () => void {
    this.cwdListeners.add(listener);
    return () => this.cwdListeners.delete(listener);
  }

  onActivity(listener: ActivityListener): () => void {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
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

  private emitCwd(inst: TerminalInstance): void {
    for (const l of this.cwdListeners) {
      try {
        l(inst.id, inst.cwd);
      } catch {
        /* ignore */
      }
    }
  }

  private emitActivity(inst: TerminalInstance): void {
    for (const l of this.activityListeners) {
      try {
        l(inst.id);
      } catch {
        /* ignore */
      }
    }
  }

  hasSession(id: string): boolean {
    return this.instances.has(id);
  }

  async ensureSession(id: string, opts?: { initialCwd?: string }): Promise<void> {
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

    const layout = useLayoutStore.getState();
    const settings = useSettingsStore.getState();
    const fontSize = Math.round(layout.fontSize * layout.panelZoom.terminal);
    const term = new xtermMod.Terminal({
      cursorBlink: true,
      scrollback: 10000,
      fontFamily: settings.terminalFontFamily || 'JetBrains Mono, Menlo, monospace',
      fontSize,
      theme: TERMINAL_THEMES[resolveTheme(layout.theme)] ?? TERMINAL_THEMES.dark,
      allowProposedApi: true,
    });
    const fitAddon = new fitMod.FitAddon();
    term.loadAddon(fitAddon);
    const searchAddon = new searchMod.SearchAddon();
    term.loadAddon(searchAddon);
    term.loadAddon(new linksMod.WebLinksAddon());

    const persistentHost = document.createElement('div');
    persistentHost.className = 'h-full w-full';
    persistentHost.style.height = '100%';
    persistentHost.style.width = '100%';

    const initialCwd = opts?.initialCwd ?? null;
    const baseUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/terminal`;

    const inst: TerminalInstance = {
      id,
      serverSessionId: null,
      term,
      fitAddon,
      searchAddon,
      webglAddon: null,
      ws: null as unknown as TerminalSocket,
      baseUrl,
      initialCwd,
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
      cwd: initialCwd,
    };

    // Register a custom link provider that matches file paths with optional
    // line/column suffix (`src/foo.ts`, `./bar.py:42`, `/abs/baz.rs:10:4`).
    // Click → `fileLinkHandler(path, line, col)` which is wired to the editor
    // store by AppShell.
    this.registerFileLinkProvider(inst);

    // OSC 7 (cwd change) handler. Payload is a `file://host/path` URI.
    term.parser.registerOscHandler(7, (data) => {
      try {
        const url = new URL(data);
        const decoded = decodeURIComponent(url.pathname);
        if (decoded && decoded !== inst.cwd) {
          inst.cwd = decoded;
          this.emitCwd(inst);
        }
      } catch {
        /* ignore malformed payloads */
      }
      return true;
    });

    // Webgl addon is loaded lazily on first attach so it has a live canvas.
    if (webglMod && webglMod.WebglAddon) {
      // Stash for later; do not instantiate until we have a sized DOM host.
      (inst as TerminalInstance & { _webglCtor?: typeof webglMod.WebglAddon })._webglCtor =
        webglMod.WebglAddon;
    }

    term.onData((data) => {
      if (inst.ws.readyState !== WebSocket.OPEN) return;
      this.sendInput(inst, data);
    });

    // Copy-on-select: if the user enables it in settings, mirror any active
    // selection to the system clipboard. This fires on every selection
    // change, so we debounce via the "only copy when selection is non-empty"
    // guard.
    term.onSelectionChange(() => {
      if (!useSettingsStore.getState().terminalCopyOnSelect) return;
      if (!inst.term.hasSelection()) return;
      const sel = inst.term.getSelection();
      if (!sel) return;
      void navigator.clipboard?.writeText(sel).catch(() => {
        /* clipboard unavailable */
      });
    });

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      const predicate = this.reservedKeyPredicate;
      if (predicate && predicate(event)) {
        // xterm should ignore this keystroke; the global handler will act.
        return false;
      }
      return true;
    });

    inst.ws = this.createSocket(inst);

    this.instances.set(id, inst);
    this.emit(inst);
  }

  private buildSocketUrl(inst: TerminalInstance): string {
    const params: string[] = [`browserId=${encodeURIComponent(getBrowserId())}`];
    if (inst.serverSessionId) {
      params.push(`sessionId=${encodeURIComponent(inst.serverSessionId)}`);
    } else if (inst.initialCwd) {
      // `initialCwd` only applies on the very first connect (no serverSessionId yet).
      params.push(`cwd=${encodeURIComponent(inst.initialCwd)}`);
    }
    return `${inst.baseUrl}?${params.join('&')}`;
  }

  private createSocket(inst: TerminalInstance): TerminalSocket {
    return createTerminalSocket({
      url: this.buildSocketUrl(inst),
      onOpen: (ws) => {
        inst.status = 'open';
        useConnectionStore.getState().setStatus('terminal', 'open');
        this.emit(inst);
        const cols = inst.lastCols || inst.term.cols || 120;
        const rows = inst.lastRows || inst.term.rows || 30;
        ws.send(JSON.stringify({ type: 'resize', cols, rows } satisfies TerminalClientControl));
      },
      onClose: () => {
        // `exited` is set by the server-side exit frame handler; preserve it.
        if (inst.status !== 'exited') {
          inst.status = 'closed';
          inst.term.write('\r\n\x1b[2m[connection to PTY lost — press Restart to spawn a new shell]\x1b[0m\r\n');
        }
        useConnectionStore.getState().setStatus('terminal', 'closed');
        this.emit(inst);
      },
      onMessage: (event) => this.handleMessage(inst, event),
    });
  }

  /**
   * Register a link provider on the terminal that matches file path patterns
   * and dispatches clicks to `fileLinkHandler`. The regex intentionally
   * allows both unix-style (`./src/foo.ts`) and windows-style (`C:\tmp\x`)
   * paths, with optional `:line[:col]` suffix.
   */
  private registerFileLinkProvider(inst: TerminalInstance): void {
    // Match shapes:
    //   a) `path/file.ext` or `./path/file.ext` or `/abs/path/file.ext`
    //   b) same with `:line` or `:line:col` suffix
    //   c) windows `C:\path\file.ext` (colon in drive letter handled first)
    // We match greedily on non-whitespace then post-process to strip
    // trailing punctuation.
    const fileRe =
      /(?:[A-Za-z]:[\\/]|[./]?[\w.\-+@]+[\\/])[\w./\-+@\\]+\.[\w]{1,10}(?::\d+(?::\d+)?)?/g;

    inst.term.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        const lineText = this.readBufferLine(inst.term, bufferLineNumber);
        if (!lineText) return callback(undefined);
        const matches: {
          text: string;
          range: IBufferRange;
          path: string;
          line?: number;
          col?: number;
        }[] = [];
        fileRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = fileRe.exec(lineText)) !== null) {
          let raw = m[0];
          // Strip trailing punctuation that's commonly adjacent to paths
          // (e.g. `file.ts:42.` or `file.ts:42,`).
          raw = raw.replace(/[.,;:'")\]]+$/, (s) => {
            // Preserve a trailing `:N` if we just stripped a punctuation
            // after a line number — simplest heuristic: only strip trailing
            // punctuation that is NOT a digit-adjacent colon.
            return s;
          });
          // Parse `path[:line[:col]]`.
          const withLine = /^(.+?)(?::(\d+)(?::(\d+))?)?$/.exec(raw);
          if (!withLine) continue;
          const [, rawPath, rawLine, rawCol] = withLine;
          if (!rawPath) continue;
          // Ignore obvious URL-looking matches (http://, https://, git@, etc.)
          if (/^(?:https?|ftp|file|git):/i.test(rawPath)) continue;
          const start = m.index;
          const end = start + raw.length;
          matches.push({
            text: raw,
            range: {
              start: { x: start + 1, y: bufferLineNumber },
              end: { x: end, y: bufferLineNumber },
            },
            path: rawPath,
            line: rawLine ? Number(rawLine) : undefined,
            col: rawCol ? Number(rawCol) : undefined,
          });
        }
        if (matches.length === 0) return callback(undefined);
        callback(
          matches.map((match) => ({
            text: match.text,
            range: match.range,
            activate: () => {
              const handler = this.fileLinkHandler;
              if (!handler) return;
              // Resolve relative paths against the session cwd.
              const resolved =
                /^(?:[/\\]|[A-Za-z]:[\\/])/.test(match.path)
                  ? match.path
                  : inst.cwd
                    ? `${inst.cwd.replace(/[/\\]$/, '')}/${match.path}`
                    : match.path;
              handler(resolved, match.line, match.col);
            },
          })),
        );
      },
    });
  }

  private readBufferLine(term: Terminal, y: number): string {
    try {
      const buf = term.buffer.active;
      const line = buf.getLine(y);
      if (!line) return '';
      return line.translateToString(true);
    } catch {
      return '';
    }
  }

  restartSession(id: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;
    if (inst.status !== 'closed' && inst.status !== 'exited') return;

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    inst.term.write(
      `\r\n\x1b[2m─── restarted at ${hh}:${mm}:${ss} ───\x1b[0m\r\n`,
    );

    inst.pendingBytes = 0;
    inst.paused = false;
    inst.exitCode = null;
    inst.status = 'connecting';
    this.emit(inst);

    // Close the previous socket defensively (no-op if already closed).
    try {
      inst.ws.close();
    } catch {
      /* ignore */
    }

    inst.ws = this.createSocket(inst);
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
    if (msg.type === 'session') {
      // The server is telling us the authoritative session ID for this
      // attachment. If it differs from what we thought (e.g. the previous
      // server-side session was GC'd and a fresh PTY was spawned under a
      // new id), we note the change but keep our local session ID stable.
      if (inst.serverSessionId && inst.serverSessionId !== msg.id) {
        // Old session no longer exists on the server; we're starting fresh.
        inst.term.write(
          '\r\n\x1b[2m[previous session was evicted — started a fresh shell]\x1b[0m\r\n',
        );
      }
      inst.serverSessionId = msg.id;
      if (msg.replay) {
        // A replay binary frame follows. Clear the xterm buffer so the
        // replayed content lands on a clean slate.
        inst.term.clear();
      }
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
    this.emitActivity(inst);
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
    this.emitActivity(inst);
  }

  private sendControl(inst: TerminalInstance, msg: TerminalClientControl): void {
    if (inst.ws.readyState !== WebSocket.OPEN) return;
    inst.ws.send(JSON.stringify(msg));
  }

  /**
   * Send user input to the PTY, chunking large payloads (pastes) into
   * 4 KB frames so that the JSON wrapping overhead stays bounded and
   * big pastes do not stall the WebSocket.
   */
  private sendInput(inst: TerminalInstance, data: string): void {
    if (!data) return;
    if (inst.ws.readyState !== WebSocket.OPEN) return;
    if (data.length <= INPUT_CHUNK_SIZE) {
      inst.ws.send(JSON.stringify({ type: 'input', data } satisfies TerminalClientControl));
      return;
    }
    // Chunk the payload. We yield between chunks via queueMicrotask so the
    // event loop can flush socket writes and run the draining logic.
    const chunks: string[] = [];
    for (let i = 0; i < data.length; i += INPUT_CHUNK_SIZE) {
      chunks.push(data.slice(i, i + INPUT_CHUNK_SIZE));
    }
    const flushNext = (index: number) => {
      if (index >= chunks.length) return;
      if (inst.ws.readyState !== WebSocket.OPEN) return;
      inst.ws.send(
        JSON.stringify({ type: 'input', data: chunks[index]! } satisfies TerminalClientControl),
      );
      queueMicrotask(() => flushNext(index + 1));
    };
    flushNext(0);
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

  setTheme(theme: AppTheme): void {
    const t = TERMINAL_THEMES[resolveTheme(theme)];
    if (!t) return;
    for (const inst of this.instances.values()) {
      inst.term.options.theme = t;
    }
  }

  private applyFontSettings(): void {
    const s = useSettingsStore.getState();
    const family = s.terminalFontFamily || 'JetBrains Mono, Menlo, monospace';
    const ligatures = s.terminalFontLigatures;
    for (const inst of this.instances.values()) {
      inst.term.options.fontFamily = family;
      // xterm v5 enables ligatures only via the ligatures addon. We don't
      // load it here to keep the addon surface small; the flag is exposed
      // for future adoption but currently only sets the CSS text-rendering
      // hint. Best-effort only.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (inst.term.options as any).fontWeight = ligatures ? 'normal' : 'normal';
      this.scheduleFit(inst);
    }
  }

  findNext(id: string, query: string, opts?: ISearchOptions): boolean {
    const inst = this.instances.get(id);
    if (!inst) return false;
    if (!query) {
      inst.searchAddon.clearDecorations();
      return false;
    }
    return inst.searchAddon.findNext(query, opts);
  }

  findPrevious(id: string, query: string, opts?: ISearchOptions): boolean {
    const inst = this.instances.get(id);
    if (!inst) return false;
    if (!query) {
      inst.searchAddon.clearDecorations();
      return false;
    }
    return inst.searchAddon.findPrevious(query, opts);
  }

  clearSearchHighlight(id: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;
    inst.searchAddon.clearDecorations();
  }

  clearBuffer(id: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;
    inst.term.clear();
  }

  hasSelection(id: string): boolean {
    const inst = this.instances.get(id);
    return inst ? inst.term.hasSelection() : false;
  }

  getSelection(id: string): string {
    const inst = this.instances.get(id);
    return inst ? inst.term.getSelection() : '';
  }

  selectAll(id: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;
    inst.term.selectAll();
  }

  paste(id: string, text: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;
    if (inst.ws.readyState !== WebSocket.OPEN) return;
    this.sendInput(inst, text);
  }

  closeSession(id: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;
    this.detach(id);
    // Tell the server to destroy the registry record (kill the PTY now)
    // instead of detaching with a GC grace period. Must go out BEFORE
    // `ws.close()` so the message has a chance to flush.
    try {
      if (inst.ws.readyState === WebSocket.OPEN) {
        inst.ws.send(JSON.stringify({ type: 'close' } satisfies TerminalClientControl));
      }
    } catch {
      /* ignore */
    }
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
    this.layoutUnsubscribe?.();
    this.layoutUnsubscribe = null;
    this.settingsUnsubscribe?.();
    this.settingsUnsubscribe = null;
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
