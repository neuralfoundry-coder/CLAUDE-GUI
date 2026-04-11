import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReconnectingWebSocket } from '@/lib/websocket/reconnecting-ws';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  readyState = 0;
  listeners: Record<string, Array<(e: unknown) => void>> = {};
  url: string;
  binaryType = 'blob';

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(name: string, fn: (e: unknown) => void): void {
    (this.listeners[name] ||= []).push(fn);
  }

  dispatchEvent(name: string, event: unknown): void {
    (this.listeners[name] || []).forEach((fn) => fn(event));
  }

  send(_data: unknown): void {}

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.dispatchEvent('close', { code: 1000 });
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.dispatchEvent('open', {});
  }
}

describe('ReconnectingWebSocket', () => {
  let originalWs: unknown;

  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWs = (globalThis as unknown as { WebSocket?: unknown }).WebSocket;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWs;
    vi.useRealTimers();
  });

  it('creates a WebSocket on construction', () => {
    new ReconnectingWebSocket({ url: 'ws://localhost/test' });
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]!.url).toBe('ws://localhost/test');
  });

  it('sets binaryType to arraybuffer so binary frames arrive as ArrayBuffer', () => {
    new ReconnectingWebSocket({ url: 'ws://localhost/test' });
    expect(MockWebSocket.instances[0]!.binaryType).toBe('arraybuffer');
  });

  it('calls onOpen handler', () => {
    const onOpen = vi.fn();
    new ReconnectingWebSocket({ url: 'ws://localhost/test', onOpen });
    MockWebSocket.instances[0]!.simulateOpen();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('reconnects with exponential backoff on close', () => {
    new ReconnectingWebSocket({ url: 'ws://localhost/test', initialBackoffMs: 100 });
    expect(MockWebSocket.instances).toHaveLength(1);
    MockWebSocket.instances[0]!.close();
    vi.advanceTimersByTime(100);
    expect(MockWebSocket.instances).toHaveLength(2);
    MockWebSocket.instances[1]!.close();
    vi.advanceTimersByTime(200);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('stops reconnecting after close()', () => {
    const rws = new ReconnectingWebSocket({ url: 'ws://localhost/test', initialBackoffMs: 100 });
    rws.close();
    vi.advanceTimersByTime(10_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('caps backoff at maxBackoffMs', () => {
    const rws = new ReconnectingWebSocket({
      url: 'ws://localhost/test',
      initialBackoffMs: 1_000,
      maxBackoffMs: 2_000,
    });
    for (let i = 0; i < 5; i++) {
      MockWebSocket.instances[i]!.close();
      vi.advanceTimersByTime(2_000);
    }
    expect(MockWebSocket.instances.length).toBeGreaterThan(5);
    rws.close();
  });
});
