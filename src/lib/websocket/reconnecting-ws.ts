export interface ReconnectingWsOptions {
  url: string;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  onOpen?: (ws: WebSocket) => void;
  onMessage?: (event: MessageEvent) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
}

export class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private backoff: number;
  private readonly initialBackoff: number;
  private readonly maxBackoff: number;
  private readonly url: string;
  private readonly handlers: Pick<
    ReconnectingWsOptions,
    'onOpen' | 'onMessage' | 'onClose' | 'onError'
  >;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private boundBeforeUnload: (() => void) | null = null;

  constructor(opts: ReconnectingWsOptions) {
    this.url = opts.url;
    this.initialBackoff = opts.initialBackoffMs ?? 1_000;
    this.maxBackoff = opts.maxBackoffMs ?? 30_000;
    this.backoff = this.initialBackoff;
    this.handlers = opts;

    // Close cleanly on page unload to prevent reconnection and allow
    // the server to detect the disconnect immediately.
    if (typeof window !== 'undefined') {
      this.boundBeforeUnload = () => {
        this.close();
      };
      window.addEventListener('beforeunload', this.boundBeforeUnload);
    }

    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    // Drop reference to the previous (already-closed) socket so it can be GC'd
    // along with its event listeners — prevents memory accumulation across reconnects.
    this.ws = null;
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.scheduleReconnect();
      return;
    }
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('open', () => {
      this.backoff = this.initialBackoff;
      this.handlers.onOpen?.(this.ws!);
    });
    this.ws.addEventListener('message', (e) => this.handlers.onMessage?.(e));
    this.ws.addEventListener('error', (e) => this.handlers.onError?.(e));
    this.ws.addEventListener('close', (e) => {
      this.handlers.onClose?.(e);
      if (!this.closed) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  sendJson(obj: unknown): void {
    this.send(JSON.stringify(obj));
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (typeof window !== 'undefined' && this.boundBeforeUnload) {
      window.removeEventListener('beforeunload', this.boundBeforeUnload);
      this.boundBeforeUnload = null;
    }
    this.ws?.close();
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}
