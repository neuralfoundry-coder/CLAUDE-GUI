import { describe, it, expect, beforeEach, vi } from 'vitest';

type PtyDataHandler = (data: string | Buffer) => void;
type PtyExitHandler = (evt: { exitCode: number | null; signal?: number }) => void;

interface FakePty {
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  onData: (cb: PtyDataHandler) => void;
  onExit: (cb: PtyExitHandler) => void;
  emitData: (data: string | Buffer) => void;
  emitExit: (code: number | null) => void;
}

function createFakePty(): FakePty {
  let dataHandler: PtyDataHandler | null = null;
  let exitHandler: PtyExitHandler | null = null;
  return {
    write: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    kill: vi.fn(),
    onData: (cb) => {
      dataHandler = cb;
    },
    onExit: (cb) => {
      exitHandler = cb;
    },
    emitData: (data) => dataHandler?.(data),
    emitExit: (code) => exitHandler?.({ exitCode: code }),
  };
}

let currentPty: FakePty | null = null;

vi.mock('node-pty', () => ({
  default: {
    spawn: vi.fn(() => {
      currentPty = createFakePty();
      return currentPty;
    }),
  },
  spawn: vi.fn(() => {
    currentPty = createFakePty();
    return currentPty;
  }),
}));

vi.mock('../../src/lib/project/project-context.mjs', () => ({
  getActiveRoot: () => '/tmp',
}));

vi.mock('../../src/lib/debug.mjs', () => ({
  createDebug: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    log: () => {},
    trace: () => {},
  }),
}));

interface FakeWsMessage {
  payload: unknown;
  binary: boolean;
}

class FakeWs {
  readonly OPEN = 1;
  readonly CLOSED = 3;
  readyState = 1;
  sent: FakeWsMessage[] = [];
  listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  closeCode: number | null = null;

  on(name: string, cb: (...args: unknown[]) => void): this {
    (this.listeners[name] ||= []).push(cb);
    return this;
  }

  send(payload: unknown, opts?: { binary?: boolean }): void {
    this.sent.push({ payload, binary: Boolean(opts?.binary) });
  }

  close(code?: number): void {
    this.readyState = this.CLOSED;
    this.closeCode = code ?? 1000;
    for (const cb of this.listeners.close ?? []) cb();
  }

  emit(name: string, ...args: unknown[]): void {
    for (const cb of this.listeners[name] ?? []) cb(...args);
  }
}

async function loadHandler() {
  // Reset the mocked module between tests.
  vi.resetModules();
  // @ts-expect-error — .mjs server handler has no declaration file; runtime import only.
  const mod = await import('../../server-handlers/terminal-handler.mjs');
  return mod.default as (ws: FakeWs, req: unknown) => Promise<void>;
}

describe('terminal-handler', () => {
  beforeEach(() => {
    currentPty = null;
    vi.useFakeTimers();
  });

  it('sends PTY output as a binary frame after the batch interval', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    expect(currentPty).not.toBeNull();
    currentPty!.emitData('hello world');
    await vi.advanceTimersByTimeAsync(20);
    expect(ws.sent).toHaveLength(1);
    expect(ws.sent[0]!.binary).toBe(true);
    const payload = ws.sent[0]!.payload as Buffer;
    expect(Buffer.isBuffer(payload)).toBe(true);
    expect(payload.toString('utf-8')).toBe('hello world');
  });

  it('emits exit as a TEXT JSON control frame', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    currentPty!.emitExit(0);
    const control = ws.sent.find((m) => !m.binary);
    expect(control).toBeDefined();
    expect(JSON.parse(control!.payload as string)).toEqual({ type: 'exit', code: 0 });
  });

  it('does not drop PTY output while paused; flushes on resume in order', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'pause' })), false);
    currentPty!.emitData('first ');
    currentPty!.emitData('second ');
    currentPty!.emitData('third');
    await vi.advanceTimersByTimeAsync(50);
    // Still nothing flushed while paused.
    expect(ws.sent.filter((m) => m.binary)).toHaveLength(0);
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'resume' })), false);
    // Resume flushes immediately, preserving order.
    const binaryMsgs = ws.sent.filter((m) => m.binary);
    expect(binaryMsgs).toHaveLength(1);
    expect((binaryMsgs[0]!.payload as Buffer).toString('utf-8')).toBe('first second third');
  });

  it('writes input JSON frames through to the PTY', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    ws.emit(
      'message',
      Buffer.from(JSON.stringify({ type: 'input', data: 'ls\r' })),
      false,
    );
    expect(currentPty!.write).toHaveBeenCalledWith('ls\r');
  });

  it('applies resize', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    ws.emit(
      'message',
      Buffer.from(JSON.stringify({ type: 'resize', cols: 80, rows: 24 })),
      false,
    );
    expect(currentPty!.resize).toHaveBeenCalledWith(80, 24);
  });

  it('pauses the PTY stream once the buffered output crosses the pause threshold', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'pause' })), false);
    // 300 KB of data — crosses PTY_PAUSE_THRESHOLD (256 KB) but stays under 5 MB.
    currentPty!.emitData(Buffer.alloc(300 * 1024, 0x61));
    expect(currentPty!.pause).toHaveBeenCalled();
  });

  it('kills the PTY and closes the ws on buffer overflow', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'pause' })), false);
    // Just over 5 MB.
    currentPty!.emitData(Buffer.alloc(5 * 1024 * 1024 + 1, 0x41));
    expect(currentPty!.kill).toHaveBeenCalled();
    expect(ws.readyState).toBe(ws.CLOSED);
    const overflow = ws.sent.find((m) => {
      if (m.binary) return false;
      try {
        const parsed = JSON.parse(m.payload as string);
        return parsed.type === 'error' && parsed.code === 'BUFFER_OVERFLOW';
      } catch {
        return false;
      }
    });
    expect(overflow).toBeDefined();
  });

  it('kills the PTY when the WS closes', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    ws.emit('close');
    expect(currentPty!.kill).toHaveBeenCalled();
  });
});
