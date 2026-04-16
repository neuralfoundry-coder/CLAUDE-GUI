'use client';

/**
 * Pure xterm.js wrapper — no WebSocket or network awareness.
 *
 * Owns a single xterm `Terminal` and its addons (FitAddon, SearchAddon,
 * WebLinksAddon, WebglAddon). Handles DOM attach/detach, fit scheduling,
 * resize observation, font/theme mutation, search delegation, and file link
 * detection.
 *
 * `write()` returns a Promise that resolves when xterm has consumed the data,
 * enabling the caller to implement backpressure flow control.
 */

import type { Terminal, ITerminalAddon, IBufferRange } from '@xterm/xterm';
import type { FitAddon as FitAddonT } from '@xterm/addon-fit';
import type { SearchAddon as SearchAddonT, ISearchOptions } from '@xterm/addon-search';
import type { ITheme } from '@xterm/xterm';

// ---------------------------------------------------------------------------
// xterm module loading (cached, lazy, with retry)
// ---------------------------------------------------------------------------

export type XtermModules = Awaited<ReturnType<typeof loadXtermModules>>;
let xtermModulesPromise: Promise<XtermModules> | null = null;

function loadXtermModules() {
  return Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
    import('@xterm/addon-webgl').catch(() => null),
    import('@xterm/addon-search'),
    import('@xterm/addon-web-links'),
  ] as const);
}

export function getXtermModules(): Promise<XtermModules> {
  if (!xtermModulesPromise) {
    xtermModulesPromise = loadXtermModules().catch((err) => {
      xtermModulesPromise = null;
      throw err;
    });
  }
  return xtermModulesPromise;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FileLinkHandler = (path: string, line?: number, col?: number) => void;
export type ReservedKeyPredicate = (event: KeyboardEvent) => boolean;

export interface TerminalInstanceConfig {
  fontSize: number;
  fontFamily: string;
  theme: ITheme;
  scrollback?: number;
  reservedKeyPredicate: ReservedKeyPredicate | null;
  fileLinkHandler: FileLinkHandler | null;
  /** User keystroke callback — fired by xterm.onData. */
  onData: (data: string) => void;
  /** Notification that xterm received and rendered data. */
  onActivity: () => void;
  /** OSC 7 working directory change. */
  onCwdChange?: (cwd: string) => void;
  /** Copy-on-select enabled? */
  copyOnSelect?: boolean;
}

// ---------------------------------------------------------------------------
// File link regex & helpers
// ---------------------------------------------------------------------------

const FILE_RE =
  /(?:[A-Za-z]:[\\/]|[./]?[\w.\-+@]+[\\/])[\w./\-+@\\]+\.[\w]{1,10}(?::\d+(?::\d+)?)?/g;

function readBufferLine(term: Terminal, y: number): string {
  try {
    const line = term.buffer.active.getLine(y);
    return line ? line.translateToString(true) : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// TerminalInstance
// ---------------------------------------------------------------------------

export class TerminalInstance {
  readonly term: Terminal;
  readonly fitAddon: FitAddonT;
  readonly searchAddon: SearchAddonT;
  private webglAddon: ITerminalAddon | null = null;
  private webglCtor: (new () => ITerminalAddon) | null = null;
  private persistentHost: HTMLDivElement;
  private currentHost: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private _opened = false;
  private _lastCols = 0;
  private _lastRows = 0;
  private config: TerminalInstanceConfig;
  private onResizeCallback: ((cols: number, rows: number) => void) | null = null;

  /** Tracks the session's working directory from OSC 7. */
  cwd: string | null = null;

  constructor(
    modules: XtermModules,
    config: TerminalInstanceConfig,
  ) {
    this.config = config;
    const [xtermMod, fitMod, webglMod, searchMod, linksMod] = modules;

    this.term = new xtermMod.Terminal({
      cursorBlink: true,
      scrollback: config.scrollback ?? 10_000,
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      theme: config.theme,
      allowProposedApi: true,
    });

    this.fitAddon = new fitMod.FitAddon();
    this.term.loadAddon(this.fitAddon);

    this.searchAddon = new searchMod.SearchAddon();
    this.term.loadAddon(this.searchAddon);

    this.term.loadAddon(new linksMod.WebLinksAddon());

    // Stash WebGL constructor for lazy loading on first open().
    if (webglMod && webglMod.WebglAddon) {
      this.webglCtor = webglMod.WebglAddon as unknown as new () => ITerminalAddon;
    }

    // Persistent DOM host — owned by this instance, re-parented on attach.
    this.persistentHost = document.createElement('div');
    this.persistentHost.className = 'h-full w-full';
    this.persistentHost.style.height = '100%';
    this.persistentHost.style.width = '100%';

    // File link provider
    this.registerFileLinkProvider();

    // OSC 7 handler
    this.term.parser.registerOscHandler(7, (data) => {
      try {
        const url = new URL(data);
        const decoded = decodeURIComponent(url.pathname);
        if (decoded && decoded !== this.cwd) {
          this.cwd = decoded;
          config.onCwdChange?.(decoded);
        }
      } catch {
        /* malformed payload */
      }
      return true;
    });

    // User keystrokes
    this.term.onData((data) => config.onData(data));

    // Copy-on-select
    this.term.onSelectionChange(() => {
      if (!config.copyOnSelect) return;
      if (!this.term.hasSelection()) return;
      const sel = this.term.getSelection();
      if (!sel) return;
      void navigator.clipboard?.writeText(sel).catch(() => {});
    });

    // Reserved key handler
    this.term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      const pred = this.config.reservedKeyPredicate;
      if (pred && pred(event)) return false;
      return true;
    });

    this._lastCols = this.term.cols;
    this._lastRows = this.term.rows;
  }

  // ── DOM lifecycle ─────────────────────────────────────────────────────

  open(host: HTMLElement): void {
    if (this._opened) {
      this.attach(host);
      return;
    }
    host.appendChild(this.persistentHost);
    this.currentHost = host;
    this.term.open(this.persistentHost);
    this._opened = true;
    this.tryLoadWebgl();
    this.observe();
    this.scheduleFit(0, true);
  }

  attach(host: HTMLElement): void {
    if (!this._opened) {
      this.open(host);
      return;
    }
    if (this.persistentHost.parentElement !== host) {
      host.appendChild(this.persistentHost);
    }
    this.currentHost = host;
    this.observe();
    this.scheduleFit(0, true);
  }

  detach(): void {
    this.unobserve();
    if (this.persistentHost.parentElement) {
      try {
        this.persistentHost.parentElement.removeChild(this.persistentHost);
      } catch { /* ignore */ }
    }
    this.currentHost = null;
  }

  dispose(): void {
    this.unobserve();
    try { this.term.dispose(); } catch { /* ignore */ }
  }

  // ── Data ──────────────────────────────────────────────────────────────

  /** Write data to xterm. Resolves when xterm has consumed it. */
  write(data: string | Uint8Array): Promise<void> {
    return new Promise<void>((resolve) => {
      this.term.write(data, resolve);
    });
  }

  writeln(text: string): void {
    this.term.write(`\r\n${text}\r\n`);
  }

  clear(): void {
    this.term.clear();
  }

  // ── Sizing ────────────────────────────────────────────────────────────

  /** Set callback for resize events (sends to server). */
  onResize(cb: (cols: number, rows: number) => void): void {
    this.onResizeCallback = cb;
  }

  fit(): { cols: number; rows: number } | null {
    try {
      this.fitAddon.fit();
    } catch {
      return null;
    }
    const cols = this.term.cols;
    const rows = this.term.rows;
    if (cols !== this._lastCols || rows !== this._lastRows) {
      this._lastCols = cols;
      this._lastRows = rows;
      this.onResizeCallback?.(cols, rows);
    }
    return { cols, rows };
  }

  get cols(): number { return this.term.cols; }
  get rows(): number { return this.term.rows; }
  get lastCols(): number { return this._lastCols || this.term.cols || 120; }
  get lastRows(): number { return this._lastRows || this.term.rows || 30; }
  get isOpened(): boolean { return this._opened; }

  // ── Appearance ────────────────────────────────────────────────────────

  setFontSize(px: number): void {
    this.term.options.fontSize = px;
    this.scheduleFit();
  }

  setTheme(theme: ITheme): void {
    this.term.options.theme = theme;
  }

  setFontFamily(family: string): void {
    this.term.options.fontFamily = family;
    this.scheduleFit();
  }

  // ── Search ────────────────────────────────────────────────────────────

  findNext(query: string, opts?: ISearchOptions): boolean {
    if (!query) { this.searchAddon.clearDecorations(); return false; }
    return this.searchAddon.findNext(query, opts);
  }

  findPrevious(query: string, opts?: ISearchOptions): boolean {
    if (!query) { this.searchAddon.clearDecorations(); return false; }
    return this.searchAddon.findPrevious(query, opts);
  }

  clearSearch(): void {
    this.searchAddon.clearDecorations();
  }

  // ── Selection ─────────────────────────────────────────────────────────

  hasSelection(): boolean { return this.term.hasSelection(); }
  getSelection(): string { return this.term.getSelection(); }
  selectAll(): void { this.term.selectAll(); }
  focus(): void { this.term.focus(); }

  // ── Internals ─────────────────────────────────────────────────────────

  private tryLoadWebgl(): void {
    if (!this.webglCtor || this.webglAddon) return;
    try {
      const addon = new this.webglCtor();
      this.term.loadAddon(addon);
      this.webglAddon = addon;
    } catch {
      this.webglAddon = null;
    }
  }

  private observe(): void {
    this.unobserve();
    if (!this.currentHost) return;
    const observer = new ResizeObserver(() => this.scheduleFit());
    try {
      observer.observe(this.currentHost);
      this.resizeObserver = observer;
    } catch {
      /* ignore */
    }
  }

  private unobserve(): void {
    if (this.resizeObserver) {
      try { this.resizeObserver.disconnect(); } catch { /* ignore */ }
      this.resizeObserver = null;
    }
  }

  private scheduleFit(attempt = 0, focusOnSuccess = false): void {
    if (!this.currentHost || !this._opened) return;
    const tryFit = () => {
      if (!this.currentHost) return;
      const { clientWidth, clientHeight } = this.currentHost;
      if (clientWidth === 0 || clientHeight === 0) {
        if (attempt < 10) this.scheduleFit(attempt + 1, focusOnSuccess);
        return;
      }
      this.fit();
      if (focusOnSuccess) this.term.focus();
    };
    if (attempt < 5) {
      requestAnimationFrame(tryFit);
    } else {
      setTimeout(tryFit, 100);
    }
  }

  private registerFileLinkProvider(): void {
    this.term.registerLinkProvider({
      provideLinks: (y, callback) => {
        const lineText = readBufferLine(this.term, y);
        if (!lineText) return callback(undefined);
        const matches: Array<{
          text: string;
          range: IBufferRange;
          path: string;
          line?: number;
          col?: number;
        }> = [];
        FILE_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = FILE_RE.exec(lineText)) !== null) {
          let raw = m[0];
          raw = raw.replace(/[.,;:'")\]]+$/, (s) => s);
          const withLine = /^(.+?)(?::(\d+)(?::(\d+))?)?$/.exec(raw);
          if (!withLine) continue;
          const [, rawPath, rawLine, rawCol] = withLine;
          if (!rawPath) continue;
          if (/^(?:https?|ftp|file|git):/i.test(rawPath)) continue;
          const start = m.index;
          const end = start + raw.length;
          matches.push({
            text: raw,
            range: {
              start: { x: start + 1, y },
              end: { x: end, y },
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
              const handler = this.config.fileLinkHandler;
              if (!handler) return;
              const resolved =
                /^(?:[/\\]|[A-Za-z]:[\\/])/.test(match.path)
                  ? match.path
                  : this.cwd
                    ? `${this.cwd.replace(/[/\\]$/, '')}/${match.path}`
                    : match.path;
              handler(resolved, match.line, match.col);
            },
          })),
        );
      },
    });
  }
}
