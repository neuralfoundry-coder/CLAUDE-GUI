/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTerminalSocket } from '../../src/lib/terminal/terminal-socket';

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

describe('TerminalSocket', () => {
  it('invokes onOpen with the live WebSocket', () => {
    const onOpen = vi.fn();
    createTerminalSocket({ url: 'ws://localhost/ws/terminal', onOpen });
    MockWebSocket.instances[0]!.simulateOpen();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('does NOT reconnect after an unexpected close', () => {
    const onClose = vi.fn();
    createTerminalSocket({ url: 'ws://localhost/ws/terminal', onClose });
    expect(MockWebSocket.instances.length).toBe(1);
    MockWebSocket.instances[0]!.simulateCloseFromServer();
    // Give any pending microtasks a chance to run.
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('close() marks the wrapper as closed and closes the underlying ws', () => {
    const socket = createTerminalSocket({ url: 'ws://localhost/ws/terminal' });
    expect(socket.isClosed).toBe(false);
    socket.close();
    expect(socket.isClosed).toBe(true);
    expect(MockWebSocket.instances[0]!.readyState).toBe(MockWebSocket.CLOSED);
  });

  it('send() forwards data only when the socket is open', () => {
    const socket = createTerminalSocket({ url: 'ws://localhost/ws/terminal' });
    socket.send('hello');
    expect(MockWebSocket.instances[0]!.sent).toHaveLength(0); // not open yet
    MockWebSocket.instances[0]!.simulateOpen();
    socket.send('hello');
    expect(MockWebSocket.instances[0]!.sent).toEqual(['hello']);
  });

  it('sendJson serializes and forwards', () => {
    const socket = createTerminalSocket({ url: 'ws://localhost/ws/terminal' });
    MockWebSocket.instances[0]!.simulateOpen();
    socket.sendJson({ type: 'input', data: 'ls' });
    expect(MockWebSocket.instances[0]!.sent).toEqual([
      JSON.stringify({ type: 'input', data: 'ls' }),
    ]);
  });
});
