/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalConnection, type ConnectionStatus } from '../../src/lib/terminal/terminal-connection';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 0;
  binaryType = '';
  listeners: Record<string, Array<(e: unknown) => void>> = {};
  sent: unknown[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(name: string, cb: (e: unknown) => void): void {
    (this.listeners[name] ||= []).push(cb);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    for (const cb of this.listeners.close ?? []) cb({ type: 'close' });
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    for (const cb of this.listeners.open ?? []) cb({ type: 'open' });
  }

  simulateCloseFromServer(): void {
    this.readyState = MockWebSocket.CLOSED;
    for (const cb of this.listeners.close ?? []) cb({ type: 'close' });
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  // @ts-expect-error — replace global constructor with a mock.
  globalThis.WebSocket = MockWebSocket;
  // @ts-expect-error — static constants expected by code under test.
  globalThis.WebSocket.OPEN = MockWebSocket.OPEN;
  // @ts-expect-error — static constants expected by code under test.
  globalThis.WebSocket.CLOSED = MockWebSocket.CLOSED;
});

function createTestConnection(overrides?: Partial<{
  onStatusChange: (status: ConnectionStatus) => void;
  onControl: (msg: unknown) => void;
  onPtyData: (data: Uint8Array) => void;
  onPtyText: (text: string) => void;
}>) {
  return new TerminalConnection({
    baseUrl: 'ws://localhost/ws/terminal',
    browserId: 'test-browser-id',
    initialCwd: null,
    onPtyData: overrides?.onPtyData ?? vi.fn(),
    onPtyText: overrides?.onPtyText ?? vi.fn(),
    onControl: overrides?.onControl ?? vi.fn(),
    onStatusChange: overrides?.onStatusChange ?? vi.fn(),
  });
}

describe('TerminalConnection', () => {
  it('transitions to open on WebSocket connect', () => {
    const onStatusChange = vi.fn();
    createTestConnection({ onStatusChange });
    MockWebSocket.instances[0]!.simulateOpen();
    expect(onStatusChange).toHaveBeenCalledWith('open');
  });

  it('sends input only when WebSocket is open', () => {
    const conn = createTestConnection();
    conn.sendInput('before');
    expect(MockWebSocket.instances[0]!.sent).toHaveLength(0); // not open yet
    MockWebSocket.instances[0]!.simulateOpen();
    // After open, the queued 'before' is flushed first
    conn.sendInput('hello');
    const sent = MockWebSocket.instances[0]!.sent as string[];
    // Last sent should be 'hello'
    expect(sent[sent.length - 1]).toBe(JSON.stringify({ type: 'input', data: 'hello' }));
  });

  it('queues input while connecting and flushes on open', () => {
    const conn = createTestConnection();
    conn.sendInput('buffered');
    expect(MockWebSocket.instances[0]!.sent).toHaveLength(0);
    MockWebSocket.instances[0]!.simulateOpen();
    // After open, the queued input should be flushed
    expect(MockWebSocket.instances[0]!.sent.length).toBeGreaterThanOrEqual(1);
  });

  it('dispose() closes the connection', () => {
    const connection = createTestConnection();
    connection.dispose();
    expect(connection.status).not.toBe('open');
  });

  it('transitions to closed when no serverSessionId set (no reconnect)', () => {
    const onStatusChange = vi.fn();
    createTestConnection({ onStatusChange });
    MockWebSocket.instances[0]!.simulateOpen();
    onStatusChange.mockClear();
    MockWebSocket.instances[0]!.simulateCloseFromServer();
    // Without serverSessionId, should go straight to closed
    expect(onStatusChange).toHaveBeenCalledWith('closed');
  });
});
