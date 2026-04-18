# Terminal Architecture v2 Design

## 1. Current Architecture Problems Summary

### Structural Issues
| # | Problem | Location | Severity |
|---|---------|----------|----------|
| A1 | **God Object**: `TerminalManager` 989 lines — handles PTY, xterm, WebSocket, search, fonts, themes, links, backpressure | `terminal-manager.ts` | Critical |
| A2 | **Dual state**: Store `sessions[]` vs Manager `instances Map` — no guaranteed consistency | store + manager | Critical |
| A3 | **No reconnection**: WebSocket drops require manual restart. Server keeps PTY alive 30min but client doesn't attempt reconnect | `terminal-socket.ts` | Critical |
| A4 | **Hard-coded timing**: OSC 7 100ms/800ms, batch 16ms, connect 15s, exit 1s, GC 30min — none adaptive or configurable | throughout | High |

### Server Issues
| # | Problem | Location |
|---|---------|----------|
| S1 | `fs.statSync()` blocking I/O | `terminal-handler.mjs:63` |
| S2 | PTY pause/resume state mismatch — permanent deadlock if pause() throws | `terminal-handler.mjs:240-263` |
| S3 | Ring buffer memory: 256KB per detached session × 30min idle | `session-registry.mjs` |
| S4 | 1s delay between exit and destroy → stale content replay | `session-registry.mjs:90` |
| S5 | No node-pty load retry — permanent failure after first attempt | `terminal-handler.mjs:18-26` |
| S6 | `ws.send()` failures silently ignored — no logging/recovery | `terminal-handler.mjs:28-35` |

### Client Issues
| # | Problem | Location |
|---|---------|----------|
| C1 | Backpressure asymmetry: server 256KB / client 100KB, unaligned | manager + handler |
| C2 | Input queue silent data loss when >32KB | `terminal-manager.ts:368` |
| C3 | xterm eager import — 200-300ms boot delay even if terminal never used | `terminal-manager.ts:109` |
| C4 | No visual backpressure feedback — terminal appears frozen | none |
| C5 | Search state lost on tab switch | component state |
| C6 | WebGL addon duplicate load race | `terminal-manager.ts:746` |
| C7 | All sessions lost on page reload | store not persisted |

---

## 2. New Architecture Design

### 2.1 Module Decomposition

The current 989-line `TerminalManager` is split into 4 independent modules:

```
src/lib/terminal/
├── terminal-instance.ts          ~250 lines  xterm.js wrapper (pure rendering)
├── terminal-connection.ts        ~280 lines  WebSocket + reconnect + backpressure
├── terminal-session-controller.ts ~280 lines  instance+connection orchestrator
├── terminal-registry.ts          ~200 lines  collection management + store binding
├── terminal-framing.ts           ~110 lines  wire protocol (extended)
└── terminal-themes.ts            ~134 lines  theme definitions (unchanged)

Deleted:
├── terminal-manager.ts           ← replaced by 4 modules
└── terminal-socket.ts            ← absorbed into terminal-connection.ts
```

### 2.2 Module A: `terminal-instance.ts` — xterm.js Wrapper

No WebSocket/network dependency. Pure rendering layer.

```typescript
interface TerminalInstanceConfig {
  fontSize: number;
  fontFamily: string;
  theme: ITheme;
  scrollback: number;
  reservedKeyPredicate: ((e: KeyboardEvent) => boolean) | null;
  fileLinkHandler: ((path: string, line?: number) => void) | null;
  onData: (data: string) => void;      // user keystroke callback
  onActivity: () => void;              // data received callback
}

class TerminalInstance {
  constructor(config: TerminalInstanceConfig);

  // DOM lifecycle
  open(host: HTMLElement): void;        // first mount (term.open)
  attach(host: HTMLElement): void;      // re-parent existing DOM
  detach(): void;                       // detach from DOM (WebSocket stays)
  dispose(): void;                      // full teardown

  // Data
  write(data: string | Uint8Array): Promise<void>;  // xterm write + completion callback
  clear(): void;
  writeln(text: string): void;          // system message output

  // Sizing
  fit(): { cols: number; rows: number } | null;
  get cols(): number;
  get rows(): number;

  // Appearance
  setFontSize(px: number): void;
  setTheme(theme: ITheme): void;
  setFontFamily(family: string): void;

  // Search (SearchAddon delegation)
  findNext(query: string, opts?: ISearchOptions): boolean;
  findPrevious(query: string, opts?: ISearchOptions): boolean;
  clearSearch(): void;

  // Selection/clipboard
  hasSelection(): boolean;
  getSelection(): string;
  selectAll(): void;

  // State
  get isOpened(): boolean;
}
```

**Key design points**:
- Owns xterm.js `Terminal` + `FitAddon` + `SearchAddon` + `WebLinksAddon`
- `WebglAddon` lazy-loaded on first `open()` (falls back to software renderer on failure)
- `ResizeObserver` watches container size → auto-fit
- File link provider: regex matching + `fileLinkHandler` callback
- `write()` returns Promise for backpressure tracking
- **Testable**: unit tests with jsdom + xterm mock

### 2.3 Module B: `terminal-connection.ts` — WebSocket + Reconnection

```typescript
type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

class TerminalConnection {
  get status(): ConnectionStatus;
  get serverSessionId(): string | null;

  sendInput(data: string): void;        // 4KB chunking + microtask yield
  sendResize(cols: number, rows: number): void;
  sendPause(): void;
  sendResume(): void;
  sendClose(): void;                     // explicit PTY kill request to server

  close(): void;                         // disconnect without killing server session
  dispose(): void;                       // give up reconnection + cleanup
  setServerSessionId(id: string): void;  // store server-provided session ID
}
```

**Reconnection strategy**:
```
WebSocket unexpectedly closes
  └─ serverSessionId exists?
     ├─ YES: transition to 'reconnecting'
     │   └─ exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (cap)
     │       └─ reconnect with ?sessionId=<id>
     │           ├─ success: server replays ring buffer → 'open'
     │           └─ 5 failures: 'closed' → show restart UI
     └─ NO: immediate 'closed'
```

**Input queue**: Buffers keystrokes during `connecting` + `reconnecting`. Toast warning when >32KB (instead of silent loss).

### 2.4 Module C: `terminal-session-controller.ts` — Orchestrator

Composes `TerminalInstance` + `TerminalConnection` into a coherent session.

```typescript
type SessionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'exited';

class TerminalSessionController {
  // DOM
  attach(host: HTMLElement): void;
  detach(): void;
  activate(): void;                     // fit + focus

  // Lifecycle
  restart(): void;                      // closed/exited → new connection
  close(): void;                        // explicit teardown
  dispose(): void;

  // Delegated (TerminalInstance)
  setFontSize/setTheme/setFontFamily(...): void;
  findNext/findPrevious/clearSearch(...): ...;
  hasSelection/getSelection/selectAll/paste(...): ...;

  // State
  get status(): SessionStatus;
  get cwd(): string | null;
  get exitCode(): number | null;
  get serverSessionId(): string | null;
  get isBackpressured(): boolean;
}
```

**Key responsibilities**:
- Server control frame dispatch (`exit`, `error`, `session`, `backpressure_ack`)
- OSC 7 handler registration → cwd tracking
- Restart logic: clear xterm + create new connection
- Replay reception: clear xterm then write binary
- Propagate backpressure state via `onBackpressureChange` callback

### 2.5 Module D: `terminal-registry.ts` — Collection Management

The only module that imports Zustand stores.

```typescript
class TerminalRegistry {
  boot(): void;                                       // start store subscriptions
  dispose(): void;                                    // full cleanup

  has(id: string): boolean;
  get(id: string): TerminalSessionController | undefined;
  async ensureSession(id: string, opts?: {
    initialCwd?: string;
    serverSessionId?: string;                         // for reconnection
  }): Promise<void>;
  closeSession(id: string): void;

  setFileLinkHandler(handler: FileLinkHandler): void;
  setReservedKeyPredicate(predicate: ReservedKeyPredicate | null): void;
}

export const terminalRegistry: TerminalRegistry;      // singleton
```

---

## 3. State Management: Single Source of Truth

**Principle**: Zustand store = sole authority for session metadata. Registry = runtime object lookup.

### Principles

- The store owns the canonical session list; the registry owns the live xterm/WebSocket instances.
- Status transitions (idle → connecting → open → reconnecting → exited → closed) flow store → registry via subscriptions; direct mutation of live instances from outside is forbidden.
- Session persistence uses `sessionStorage` so a page reload restores the tab list but a new tab (new browser session) starts fresh.

### Store Schema Changes

```typescript
interface TerminalSession {
  id: string;
  name: string;
  createdAt: number;
  status: SessionStatus;              // adds 'reconnecting'
  exitCode: number | null;
  cwd: string | null;
  customName: boolean;
  unread: boolean;
  backpressured: boolean;             // NEW: visual feedback
  serverSessionId: string | null;     // NEW: reconnect/persist
  searchState: SearchState | null;    // NEW: survive tab switches
}
```

### Session Persistence (page reload survival)

Using Zustand `persist` middleware with `sessionStorage` (survives reloads, not new tabs).

**Restore flow**: Page load → sessionStorage hydrates sessions → XTerminalAttach mounts → `registry.ensureSession(id, { serverSessionId })` → reconnect with `?sessionId=<id>` → ring buffer replay → seamless resume.

---

## 4. Protocol Changes

### New server-to-client frame

```typescript
// Backpressure acknowledgment (fixes S2)
interface TerminalBackpressureAckControl {
  type: 'backpressure_ack';
  paused: boolean;          // actual PTY state confirmation
  bufferedBytes: number;    // current server buffer size
}

// Session frame extension
interface TerminalSessionServerControl {
  type: 'session';
  id: string;
  replay: boolean;
  fresh?: boolean;          // true if serverSessionId expired → new PTY spawned
}
```

### Aligned Backpressure

| Layer | High Watermark | Low Watermark | Action |
|-------|---------------|---------------|--------|
| Server output buffer | 256KB | 64KB | `ptyProcess.pause()`/`resume()` + `backpressure_ack` |
| Client xterm queue | 100KB | 10KB | Send `pause`/`resume` |
| Session kill | 5MB | — | Destroy session (unchanged) |

---

## 5. Server Handler Refactoring

### 5.1 `terminal-handler.mjs` fixes

- **S1**: Replace `fs.statSync()` with `fs.promises.stat()` + `fs.promises.realpath()` to avoid blocking the event loop and to resolve symlinks safely.
- **S2**: Send `backpressure_ack` with the actual PTY state after a pause/resume attempt so the client can reconcile optimistic state.
- **S5**: Retry node-pty loading up to 3 times; if all attempts fail, close the socket with a readable error code.
- **S6**: Log every `ws.send()` failure with the frame type so silent drops become visible in debug output.

### 5.2 `session-registry.mjs` fixes

- **S3**: Periodic ring buffer trim (every 5 min) for detached sessions — prevents unbounded growth after long inactivity.
- **S4**: Remove the legacy 1-second exit-to-destroy delay; cleanup now runs on WebSocket close or an explicit `{type:'close'}` frame.

---

## 6. Migration Strategy

6 incremental phases, maintaining backward compatibility at each step.

### Phase 1: Extract `TerminalInstance` (non-breaking)
### Phase 2: Extract `TerminalConnection` (non-breaking)
### Phase 3: Create `TerminalSessionController` (non-breaking)
### Phase 4: Final rename + enable new features (import changes)
### Phase 5: Server-side improvements
### Phase 6: UX polish

See Korean version for full phase details.

---

## 7. Data Flow Diagrams

### Keystrokes (user → PTY)

```
keypress → xterm.onData → TerminalInstance → TerminalConnection.send({type:'input',data})
          → WebSocket → terminal-handler → ptyProcess.write
```

### PTY output (server → screen)

```
ptyProcess.onData → terminal-handler batch (16ms) → binary frame → WebSocket
          → TerminalConnection.onmessage → TerminalInstance.write → xterm.screen
```

### Session lifecycle

```
createSession() → registry.ensureSession(id) → Connection.connect(?sessionId=id)
          → server session hit → replay ring buffer → Instance.write replay frames
          → status 'open' → keypress/output flow normally
          → ws close (page reload) → status 'reconnecting' → retry
          → exit frame → status 'exited' → UI shows "Restart shell"
```

---

## 8. New File Summary

| File | Lines | Responsibility |
|------|-------|---------------|
| `src/lib/terminal/terminal-instance.ts` | ~250 | xterm.js wrapper |
| `src/lib/terminal/terminal-connection.ts` | ~280 | WebSocket + reconnect + backpressure |
| `src/lib/terminal/terminal-session-controller.ts` | ~280 | Orchestrator |
| `src/lib/terminal/terminal-registry.ts` | ~200 | Collection + store binding |
| `src/lib/terminal/terminal-framing.ts` | ~110 | Protocol (extended) |
| `src/lib/terminal/terminal-themes.ts` | ~134 | Themes (unchanged) |
| `server-handlers/terminal-handler.mjs` | ~400 | Server handler (refactored) |
| `server-handlers/terminal/session-registry.mjs` | ~210 | Session registry (improved) |

**Deleted**:
- `src/lib/terminal/terminal-manager.ts` (989 lines) → replaced by 4 modules
- `src/lib/terminal/terminal-socket.ts` (74 lines) → absorbed into `terminal-connection.ts`

**Net change**: ~1063 lines deleted, ~1010 lines created + ~610 lines modified

---

## 9. Testing Strategy

| Module | Test approach |
|--------|--------------|
| `terminal-instance.ts` | Unit tests with an xterm mock: open / attach / detach / write / fit / search |
| `terminal-connection.ts` | Unit tests with a ws mock: connect / reconnect / input queue / backpressure |
| `terminal-session-controller.ts` | Integration tests with Instance+Connection mocks: OSC 7 / control frames / restart |
| `terminal-registry.ts` | Unit tests with a store mock: ensureSession / closeSession / store binding |
| Server handler | Extend the existing `terminal-handler.test.ts` with `backpressure_ack` cases |
| E2E | Extend `terminal-ui.spec.ts` with reconnect scenarios |
