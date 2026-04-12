/**
 * Thin WebSocket wrapper used exclusively by the terminal channel.
 *
 * Unlike `ReconnectingWebSocket`, this wrapper does NOT auto-reconnect. A
 * terminal WebSocket is 1:1 bound to a single PTY on the server — silently
 * reconnecting would silently respawn a shell, leaving the xterm buffer
 * pointed at a dead process. When the socket closes (for any reason), the
 * caller is expected to decide whether to surface a "Restart" UI action and
 * call `createTerminalSocket()` again.
 */

export interface TerminalSocketOptions {
  url: string;
  onOpen?: (ws: WebSocket) => void;
  onMessage?: (event: MessageEvent) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
}

export class TerminalSocket {
  private ws: WebSocket | null = null;
  private closed = false;

  constructor(opts: TerminalSocketOptions) {
    try {
      this.ws = new WebSocket(opts.url);
    } catch (err) {
      this.closed = true;
      queueMicrotask(() => {
        opts.onError?.(new Event('error'));
        opts.onClose?.(new CloseEvent('close'));
      });
      return;
    }
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('open', () => opts.onOpen?.(this.ws!));
    this.ws.addEventListener('message', (e) => opts.onMessage?.(e));
    this.ws.addEventListener('error', (e) => opts.onError?.(e));
    this.ws.addEventListener('close', (e) => opts.onClose?.(e));
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  sendJson(obj: unknown): void {
    this.send(JSON.stringify(obj));
  }

  close(code?: number, reason?: string): void {
    this.closed = true;
    try {
      this.ws?.close(code, reason);
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  get isClosed(): boolean {
    return this.closed;
  }
}

export function createTerminalSocket(opts: TerminalSocketOptions): TerminalSocket {
  return new TerminalSocket(opts);
}
