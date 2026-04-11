# 6. External Interfaces

> English mirror of [`docs/srs/06-external-interfaces.md`](../../srs/06-external-interfaces.md).

## 6.1 User Interface

### Four-panel layout

```
┌─────────────────────────────────────────────────────────────────┐
│                          Header Bar                             │
│  [Logo] [Session: my-project] [⌘K Command Palette]  [Settings] │
├──────────┬──────────────────────────────┬───────────────────────┤
│          │                              │                       │
│  File    │     Monaco Editor            │    Preview Panel      │
│  Explorer│     ┌─────┬─────┬─────┐      │                       │
│          │     │Tab 1│Tab 2│Tab 3│      │    ┌───────────────┐  │
│  📁 src  │     └─────┴─────┴─────┘      │    │               │  │
│  ├─📄 app│     [code editing area]      │    │  HTML / PDF / │  │
│  ├─📁 lib│                              │    │  Markdown /   │  │
│  └─📁 ...│                              │    │  Slides /     │  │
│          │                              │    │  Image        │  │
│          │                              │    │               │  │
│          ├──────────────────────────────┤    │               │  │
│          │                              │    └───────────────┘  │
│          │     Terminal (xterm.js)       │    [Page: 1/5] [◀ ▶] │
│          │     $ claude "fix the bug"   │                       │
│          │     ▌                         │                       │
├──────────┴──────────────────────────────┴───────────────────────┤
│  Status Bar: [Branch: main] [Claude: idle] [Cost: $0.05]       │
└─────────────────────────────────────────────────────────────────┘
```

### UI elements per panel

**File explorer (left)**
- Directory tree view
- Folder collapse/expand arrows
- File icons by extension
- Git status indicators (color-coded)
- Header: project name, new file/folder buttons, refresh button

**Code editor (center top)**
- Tab bar: file name, close (×), unsaved indicator (●)
- Editor area: line numbers, syntax highlighting, minimap
- Diff view: accept/reject buttons
- Breadcrumb: current file path

**Terminal (center bottom)**
- Session tab bar: session name, add (+), close (×)
- Terminal body: ANSI rendering area
- Search bar: active with `Ctrl+F`

**Preview panel (right)**
- Renderer type indicator: [HTML] [PDF] [Markdown] [Image] [Slides]
- Content area: per-renderer view
- Bottom: page navigation, zoom controls
- Presentation mode: slide-thumbnail sidebar

### Permission request modal

```
┌─────────────────────────────────────┐
│  ⚠️  Permission Request             │
│                                     │
│  Tool: Edit                         │
│  File: src/lib/auth.ts              │
│                                     │
│  Claude wants to modify this file.  │
│  Lines 42-58 will be changed.       │
│                                     │
│  [  Deny  ]         [ Approve ]     │
└─────────────────────────────────────┘
```

### Command palette

```
┌──────────────────────────────────────┐
│  🔍 Type a command...                │
│ ─────────────────────────────────── │
│  > Open File          Cmd+P         │
│  > Toggle Terminal    Cmd+J         │
│  > Toggle Sidebar     Cmd+B         │
│  > New Claude Session               │
│  > Export as PPTX                    │
│  > Change Theme                      │
└──────────────────────────────────────┘
```

---

## 6.2 Software Interfaces

### Claude Agent SDK

| Item | Value |
|------|-------|
| **Package** | `@anthropic-ai/claude-agent-sdk` |
| **Integration** | Create an SDK instance in the Node.js server; receive events via async generator |
| **Input** | User prompt, session ID, options (max-turns, max-budget, etc.) |
| **Output** | `SDKMessage` event stream (assistant, stream_event, tool_call, result) |
| **Session storage** | `~/.claude/projects/` directory |

### Claude CLI

| Item | Value |
|------|-------|
| **Binary** | `claude` (must be on `PATH`) |
| **Output format** | `--output-format stream-json` (NDJSON) |
| **Input format** | `--input-format stream-json` (bidirectional NDJSON) |
| **Structured output** | `--json-schema` option |
| **Pre-warming** | `startup()` method (~20× speedup) |

### Node.js file system

| Item | Value |
|------|-------|
| **Module** | `node:fs/promises` |
| **Path validation** | `node:path` — `path.resolve()` bound check |
| **Symlink** | Validated via `fs.lstat()` |
| **Encoding** | UTF-8 for text files; Buffer for binary files |

### chokidar

| Item | Value |
|------|-------|
| **Package** | `chokidar` v5 (ESM) |
| **Watch target** | Project root directory (recursive) |
| **Ignored patterns** | `node_modules`, `.git`, `dist`, `build` |
| **Events** | `add`, `change`, `unlink`, `addDir`, `unlinkDir` |
| **Output** | Broadcast to the WebSocket `/ws/files` channel |

### node-pty

| Item | Value |
|------|-------|
| **Package** | `node-pty` (maintained by Microsoft) |
| **Function** | Create pseudo-terminals, manage shell processes |
| **Supported shells** | bash, zsh (macOS/Linux); cmd, PowerShell (Windows) |
| **Communication** | stdin/stdout streams bridged to WebSocket bidirectionally |

---

## 6.3 Communication Interfaces

### REST API endpoints

| Method | Path | Description | Request | Response |
|--------|------|-------------|---------|----------|
| GET | `/api/files?path=<dir>` | Directory listing | — | `{ entries: [{ name, type, size, mtime }] }` |
| GET | `/api/files/read?path=<file>` | Read file | — | `{ content, encoding }` |
| POST | `/api/files/write` | Write file | `{ path, content }` | `{ success: true }` |
| DELETE | `/api/files?path=<path>` | Delete file/folder | — | `{ success: true }` |
| POST | `/api/files/mkdir` | Create directory | `{ path }` | `{ success: true }` |
| POST | `/api/files/rename` | Rename/move | `{ oldPath, newPath }` | `{ success: true }` |
| GET | `/api/files/stat?path=<file>` | Metadata query | — | `{ size, mtime, isDirectory, isFile }` |
| GET | `/api/sessions` | Session list | — | `{ sessions: [{ id, name, created, cost }] }` |
| POST | `/api/sessions` | Create session | `{ name?, cwd }` | `{ session_id }` |
| GET | `/api/sessions/:id` | Session detail | — | `{ id, name, messages, cost }` |

### WebSocket protocol

**`/ws/terminal`**

```
# Client → server (all text JSON)
{ "type": "input", "data": "ls\r" }
{ "type": "resize", "cols": 120, "rows": 30 }
{ "type": "pause" }
{ "type": "resume" }

# Server → client (PTY output — binary frame, batched every 16 ms)
[binary] shell stdout bytes

# Server → client (control — text JSON)
{ "type": "exit", "code": 0 }
{ "type": "error", "code": "BUFFER_OVERFLOW", "message": "terminal output buffer exceeded 5242880 bytes" }
```

**`/ws/claude`**

```
# Client → server
{ "type": "query", "prompt": "Fix the login bug", "sessionId": "abc123", "options": { "maxTurns": 10 } }
{ "type": "permission_response", "requestId": "req-1", "approved": true }
{ "type": "abort" }

# Server → client
{ "type": "message", "data": { "type": "assistant", "content": "..." } }
{ "type": "message", "data": { "type": "stream_event", "delta": "..." } }
{ "type": "tool_call", "data": { "tool": "Edit", "args": { "file": "src/auth.ts", ... } } }
{ "type": "permission_request", "requestId": "req-1", "tool": "Bash", "args": { "command": "npm test" } }
{ "type": "result", "data": { "cost_usd": 0.05, "usage": { "input": 1200, "output": 800 }, "session_id": "abc123" } }
{ "type": "error", "message": "Session not found" }
```

**`/ws/files`**

```
# Server → client
{ "type": "change", "event": "change", "path": "src/lib/auth.ts" }
{ "type": "change", "event": "add", "path": "src/lib/new-file.ts" }
{ "type": "change", "event": "unlink", "path": "src/lib/old-file.ts" }

# Client → server
{ "type": "watch", "path": "/new/project/root" }
```

### Connection management

- **Heartbeat**: the server sends a ping every 29 seconds; the client responds with pong.
- **Reconnection**: exponential backoff (start at 1 s, double each attempt, cap at 30 s).
- **Error response**: `{ "error": "message", "code": errorCode }`

---

## 6.4 Hardware Interfaces

### Minimum specifications

| Item | Minimum | Recommended |
|------|---------|-------------|
| **CPU** | Dual-core | Quad-core or higher |
| **RAM** | 4 GB | 8 GB or more |
| **Disk** | 500 MB free | 1 GB or more free |
| **Resolution** | 1280 × 720 | 1920 × 1080 or higher |
| **Network** | Internet connection (for API calls) | Stable broadband |

### Notes

- GPU: a graphics card with WebGL 2.0 is recommended for the xterm.js WebGL acceleration.
- Disk I/O: SSD recommended (file watching and large-project exploration performance).
