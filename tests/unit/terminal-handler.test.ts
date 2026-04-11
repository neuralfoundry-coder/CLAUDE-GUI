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
  const dataHandlers: PtyDataHandler[] = [];
  const exitHandlers: PtyExitHandler[] = [];
  return {
    write: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    kill: vi.fn(),
    onData: (cb) => {
      dataHandlers.push(cb);
    },
    onExit: (cb) => {
      exitHandlers.push(cb);
    },
    emitData: (data) => {
      for (const h of dataHandlers) h(data);
    },
    emitExit: (code) => {
      for (const h of exitHandlers) h({ exitCode: code });
    },
  };
}

let currentPty: FakePty | null = null;
const lastSpawnArgs: { shell?: string; args?: readonly string[]; opts?: Record<string, unknown> } = {};

vi.mock('node-pty', () => ({
  default: {
    spawn: vi.fn((shell: string, args: readonly string[], opts: Record<string, unknown>) => {
      lastSpawnArgs.shell = shell;
      lastSpawnArgs.args = args;
      lastSpawnArgs.opts = opts;
      currentPty = createFakePty();
      return currentPty;
    }),
  },
  spawn: vi.fn((shell: string, args: readonly string[], opts: Record<string, unknown>) => {
    lastSpawnArgs.shell = shell;
    lastSpawnArgs.args = args;
    lastSpawnArgs.opts = opts;
    currentPty = createFakePty();
    return currentPty;
  }),
}));

vi.mock('../../server-handlers/terminal/shell-resolver.mjs', () => ({
  resolveShell: () => ({ shell: '/bin/zsh', args: ['-l', '-i'] }),
  buildPtyEnv: () => ({
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'ClaudeGUI',
    TERM_PROGRAM_VERSION: '0.0.0',
    LANG: 'en_US.UTF-8',
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

/** Parse all text control frames from the fake ws. */
function controlFrames(ws: FakeWs): Array<{ type: string; [k: string]: unknown }> {
  return ws.sent
    .filter((m) => !m.binary)
    .map((m) => {
      try {
        return JSON.parse(m.payload as string);
      } catch {
        return { type: '__unparseable__' };
      }
    });
}

describe('terminal-handler', () => {
  beforeEach(() => {
    currentPty = null;
    vi.useFakeTimers();
  });

  it('announces the server session id on attach', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    const session = controlFrames(ws).find((c) => c.type === 'session');
    expect(session).toBeDefined();
    expect(typeof session!.id).toBe('string');
    expect(session!.replay).toBe(false);
  });

  it('sends PTY output as a binary frame after the batch interval', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    expect(currentPty).not.toBeNull();
    currentPty!.emitData('hello world');
    await vi.advanceTimersByTimeAsync(20);
    const binary = ws.sent.filter((m) => m.binary);
    expect(binary).toHaveLength(1);
    const payload = binary[0]!.payload as Buffer;
    expect(Buffer.isBuffer(payload)).toBe(true);
    expect(payload.toString('utf-8')).toBe('hello world');
  });

  it('emits exit as a TEXT JSON control frame', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    currentPty!.emitExit(0);
    const exitFrame = controlFrames(ws).find((c) => c.type === 'exit');
    expect(exitFrame).toBeDefined();
    expect(exitFrame!.code).toBe(0);
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
    const overflow = controlFrames(ws).find(
      (c) => c.type === 'error' && (c as unknown as { code: string }).code === 'BUFFER_OVERFLOW',
    );
    expect(overflow).toBeDefined();
  });

  it('DETACHES instead of killing the PTY on ws close (registry keeps it alive)', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    ws.emit('close');
    expect(currentPty!.kill).not.toHaveBeenCalled();
  });

  it('destroys the PTY on an explicit {type:"close"} message', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'close' })), false);
    expect(currentPty!.kill).toHaveBeenCalled();
  });

  it('spawns the shell with login + interactive flags resolved by shell-resolver', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    expect(lastSpawnArgs.shell).toBe('/bin/zsh');
    expect(lastSpawnArgs.args).toEqual(['-l', '-i']);
  });

  it('passes TERM_PROGRAM=ClaudeGUI and xterm-256color in the PTY env', async () => {
    const handler = await loadHandler();
    const ws = new FakeWs();
    await handler(ws, {});
    const env = lastSpawnArgs.opts?.env as Record<string, string> | undefined;
    expect(env).toBeDefined();
    expect(env!.TERM_PROGRAM).toBe('ClaudeGUI');
    expect(env!.TERM).toBe('xterm-256color');
  });

  it('re-attaches to an existing session and replays buffered output', async () => {
    const handler = await loadHandler();
    const ws1 = new FakeWs();
    await handler(ws1, {});
    const firstSession = controlFrames(ws1).find((c) => c.type === 'session') as
      | { id: string; replay: boolean }
      | undefined;
    expect(firstSession).toBeDefined();

    // Produce some output and flush it so the ring buffer has content.
    currentPty!.emitData('before-reload');
    await vi.advanceTimersByTimeAsync(20);

    // Client goes away (e.g. page reload) — ws closes but PTY stays alive.
    ws1.emit('close');
    expect(currentPty!.kill).not.toHaveBeenCalled();

    // New attachment with the same sessionId.
    const ws2 = new FakeWs();
    await handler(ws2, { url: `/ws/terminal?sessionId=${firstSession!.id}` });

    // Should receive a session frame with replay=true and at least one
    // binary replay frame matching the prior output.
    const session2 = controlFrames(ws2).find((c) => c.type === 'session') as
      | { id: string; replay: boolean }
      | undefined;
    expect(session2).toBeDefined();
    expect(session2!.id).toBe(firstSession!.id);
    expect(session2!.replay).toBe(true);
    const binary = ws2.sent.filter((m) => m.binary);
    expect(binary.length).toBeGreaterThanOrEqual(1);
    expect((binary[0]!.payload as Buffer).toString('utf-8')).toContain('before-reload');
  });
});
