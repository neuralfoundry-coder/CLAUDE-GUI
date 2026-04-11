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

  constructor(opts: ReconnectingWsOptions) {
    this.url = opts.url;
    this.initialBackoff = opts.initialBackoffMs ?? 1_000;
    this.maxBackoff = opts.maxBackoffMs ?? 30_000;
    this.backoff = this.initialBackoff;
    this.handlers = opts;
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.scheduleReconnect();
      return;
    }
    this.ws.addEventListener('open', (e) => {
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
    this.ws?.close();
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}
