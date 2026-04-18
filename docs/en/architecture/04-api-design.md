# 4. API Design

> English mirror of [`docs/architecture/04-api-design.md`](../../architecture/04-api-design.md).

## 4.1 REST API

All REST endpoints use the `/api` prefix. Responses are JSON; errors follow a standard format.

### Common response format

```typescript
// success
{ "success": true, "data": ... }

// error
{ "success": false, "error": "message", "code": number }
```

### 4.1.1 File System API

#### `GET /api/files`

Lists directory contents.

**Query parameters**:
- `path` (required): directory path (relative to project root)

**Response**:
```json
{
  "success": true,
  "data": {
    "path": "src",
    "entries": [
      {
        "name": "app",
        "type": "directory",
        "size": 0,
        "mtime": "2026-04-10T12:34:56.000Z"
      },
      {
        "name": "page.tsx",
        "type": "file",
        "size": 1024,
        "mtime": "2026-04-11T09:00:00.000Z"
      }
    ]
  }
}
```

#### `GET /api/files/read`

Reads file content.

**Query parameters**:
- `path` (required): file path
- `encoding` (optional): `utf-8` (default) or `base64`

**Response**:
```json
{
  "success": true,
  "data": {
    "content": "...",
    "encoding": "utf-8",
    "size": 1024
  }
}
```

**Errors**:
- `404` — file not found
- `403` — path sandbox violation
- `413` — file size exceeded (text 10 MB / binary 50 MB)

#### `POST /api/files/write`

Saves a file.

**Request body**:
```json
{
  "path": "src/app/page.tsx",
  "content": "...",
  "encoding": "utf-8"
}
```

**Response**:
```json
{ "success": true, "data": { "size": 1024 } }
```

#### `DELETE /api/files`

Deletes a file or directory.

**Query parameters**:
- `path` (required)
- `recursive` (optional, set to `1` or `true` to enable): allows deleting directories that contain children. When omitted, only empty directories are accepted. The file-explorer UI always sends `recursive=1`.

#### `POST /api/files/copy`

Copies a file or directory within the project-root sandbox. Used by the in-app clipboard paste (`Cmd/Ctrl+V`), Alt-drag, and Duplicate (`Cmd/Ctrl+D`) actions (FR-211).

**Request body**:
```json
{ "srcPath": "src/foo.ts", "destPath": "src/bar/foo.ts" }
```

**Server validation**:
- `resolveSafe(srcPath)` and `resolveSafe(destPath)` confine both paths to the project root. Denied segments (`.env`, `.git`, …) are blocked.
- A request to copy a directory into itself or any descendant is rejected with `400 EINVAL`.
- If the destination already exists, the copy is suffixed with ` (1)`, ` (2)`, … instead of overwriting (matching the FR-208 upload rule).
- Implemented internally with `fs.cp(src, finalDest, { recursive: true, force: false, errorOnExist: true })`.

**Response**:
```json
{
  "success": true,
  "data": {
    "srcPath": "src/foo.ts",
    "destPath": "src/bar/foo.ts",
    "writtenPath": "src/bar/foo.ts"
  }
}
```

**Error codes**:
- `400` — missing `srcPath`/`destPath`, identical paths, copy-into-self/descendant
- `403` — sandbox escape / denied segment
- `404` — source not found
- `429` — rate limit

#### `POST /api/files/mkdir`

Creates a directory.

**Request body**:
```json
{ "path": "src/new-folder", "recursive": true }
```

#### `POST /api/files/rename`

Renames or moves a file/directory.

**Request body**:
```json
{
  "oldPath": "src/old-name.ts",
  "newPath": "src/new-name.ts"
}
```

#### `POST /api/files/upload`

Copies local OS files into the project-root sandbox. Triggered by drag-and-drop from the OS file manager or clipboard paste in the web explorer (FR-208).

**Content-Type**: `multipart/form-data`

**Form fields**:
- `destDir` (optional, default `""`): path relative to the project root. Empty string means the project root itself.
- `files` (repeated, required): `File` instances to upload. Multiple files are attached by repeating this field name.

**Server validation**:
- `resolveSafe(destDir)` restricts the destination to the project-root sandbox.
- Each filename is normalized with `path.basename`. Names equal to `.`, `..`, or containing `/`, `\`, or `\0` are rejected with `400`.
- Per-file cap: 50 MB (`MAX_BINARY_SIZE`). Per-request total cap: 200 MB. Exceeding either returns `413`.
- If a filename already exists, the server does not overwrite; it disambiguates with a ` (n)` suffix (e.g. `report.pdf` → `report (1).pdf`).
- Subject to the shared 1200 req/min files-API rate limit.

**Response**:
```json
{
  "success": true,
  "data": {
    "uploaded": [
      { "name": "logo.png", "size": 12345, "writtenPath": "assets/logo.png" }
    ]
  }
}
```

**Error codes**:
- `400` — `destDir` is not a string / no files / invalid filename / destination is not a directory
- `403` — path escapes the sandbox / denied segment (`.env`, `.git`, …)
- `404` — destination directory does not exist
- `413` — a single file or the whole request exceeds the size limit
- `429` — rate limited

#### `GET /api/files/raw`

Responds with the file as binary (for image and PDF viewers).

**Query parameters**:
- `path` (required)

**Response**: file content (Content-Type is auto-detected from extension). Returns 413 if larger than 50 MB.

#### `GET /api/files/stat`

Queries file metadata.

**Query parameters**:
- `path` (required)

**Response**:
```json
{
  "success": true,
  "data": {
    "size": 1024,
    "mtime": "2026-04-11T09:00:00.000Z",
    "ctime": "2026-04-10T12:34:56.000Z",
    "isDirectory": false,
    "isFile": true,
    "isSymbolicLink": false
  }
}
```

### 4.1.2 Git API

#### `GET /api/git/status`

Returns the project's Git status. If the project is not a Git repository, returns `isRepo: false`.

**Response**:
```json
{
  "success": true,
  "data": {
    "branch": "main",
    "isRepo": true,
    "files": {
      "src/auth.ts": "modified",
      "src/new.ts": "untracked",
      "src/old.ts": "deleted"
    }
  }
}
```

File status values: `modified`, `added`, `deleted`, `renamed`, `untracked`, `conflicted`.

The implementation calls `git status --porcelain` + `git rev-parse --abbrev-ref HEAD` via `child_process.exec`. Implementation: `src/lib/fs/git-status.ts`.

### 4.1.3 Session API

#### `GET /api/sessions`

Lists Claude sessions, based on the local `~/.claude/projects/` directory.

**Response**:
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "abc123",
        "name": "feature/auth",
        "cwd": "/Users/dev/myproject",
        "createdAt": "2026-04-01T10:00:00.000Z",
        "lastUsedAt": "2026-04-11T09:00:00.000Z",
        "totalCost": 0.25,
        "messageCount": 42
      }
    ]
  }
}
```

#### `POST /api/sessions`

Creates a new session.

**Request body**:
```json
{
  "name": "feature/new-login",
  "cwd": "/Users/dev/myproject"
}
```

**Response**:
```json
{ "success": true, "data": { "sessionId": "xyz789" } }
```

#### `GET /api/sessions/:id`

Returns session details and message history.

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "name": "feature/auth",
    "messages": [...],
    "totalCost": 0.25,
    "tokenUsage": { "input": 15000, "output": 8000 }
  }
}
```

#### `DELETE /api/sessions/:id`

Deletes a session.

### 4.1.4 Project API

#### `GET /api/project`

Returns the current project root. When the `X-Browser-Id` header is present, the root for that `browserId` is returned; otherwise the global singleton root (ADR-016) is returned.

**Request headers**:
- `X-Browser-Id` (optional): browser tab identifier UUID

**Response**:
```json
{ "success": true, "data": { "root": "/Users/dev/myproject" } }
```

#### `POST /api/project`

Changes the project root. When the `X-Browser-Id` header is present, only that tab's project root is updated.

**Request headers**:
- `X-Browser-Id` (optional): browser tab identifier UUID

**Request body**:
```json
{ "root": "/Users/dev/other-project" }
```

**Response**:
```json
{ "success": true, "data": { "root": "/Users/dev/other-project" } }
```

---

## 4.2 WebSocket Protocol

### 4.2.1 Common rules

- Message format: JSON (UTF-8 text frame) or binary frame
- Control messages are discriminated by the `type` field
- Heartbeat: server sends ping every 29 seconds; client responds with pong
- Reconnection: exponential backoff (1s → 2s → 4s → ... → 30s)
- **`browserId` routing (ADR-027)**: all WebSocket endpoints accept an optional `?browserId=<uuid>` query parameter. When present, the server resolves the project root from `BrowserSessionRegistry` instead of the global `ProjectContext` singleton. HTTP REST endpoints send the same value via the `X-Browser-Id` request header. Clients that omit `browserId` fall back to the global singleton for backward compatibility.

### 4.2.2 `/ws/terminal`

Connects to a terminal PTY session. A single PTY is spawned per connection; multiple sessions use multiple `/ws/terminal` connections.

#### On connect

```
ws://localhost:3000/ws/terminal?browserId=<uuid>
```

When `browserId` is present, the server looks up the per-tab project root from `BrowserSessionRegistry` (ADR-027) and uses it as the PTY `cwd`. When absent, the server falls back to `getActiveRoot()` from the global `ProjectContext` singleton. The default terminal size is 120x30; the client sends the real dimensions via a `resize` control frame right after the first attach.

#### Frame rules

| Direction | Frame type | Purpose |
|-----------|------------|---------|
| Server → client | **binary** | PTY stdout/stderr bytes (UTF-8) — batched every 16 ms |
| Server → client | text JSON | Control messages (`exit`, `error`) |
| Client → server | text JSON | Control messages (`input`, `resize`, `pause`, `resume`) |

The client discriminates control vs. data by `typeof event.data === 'string'`, so PTY output that happens to start with `{` is never misinterpreted.

#### Client → server (all text JSON)

**User input**:
```json
{ "type": "input", "data": "ls\r" }
```

**Resize**:
```json
{ "type": "resize", "cols": 120, "rows": 30 }
```

**Backpressure control**:
```json
{ "type": "pause" }
{ "type": "resume" }
```

#### Server → client

**PTY output** (binary frame, batched every 16 ms):
```
[binary] shell stdout bytes (includes ANSI escape sequences)
```

**Process exit** (text JSON):
```json
{ "type": "exit", "code": 0 }
```

**Error** (text JSON):
```json
{ "type": "error", "code": "BUFFER_OVERFLOW", "message": "terminal output buffer exceeded 5242880 bytes" }
```

Error codes:

| Code | Meaning |
|------|---------|
| `BUFFER_OVERFLOW` | The server-side output queue exceeded 5 MB. The server kills the PTY and closes the WebSocket with code 1011. |
| `PTY_UNAVAILABLE` | The `node-pty` native module failed to load. The server closes the WebSocket immediately. |

#### Backpressure behavior

- The client sends `{type:"pause"}` when the xterm.js write backlog exceeds 100 KB.
- While paused, the server buffers PTY output in an in-memory queue (never dropped).
- If the queue exceeds 256 KB, the server calls `ptyProcess.pause()` to stop the upstream shell (POSIX only).
- When the client's backlog drops below 10 KB, the client sends `{type:"resume"}` and the server calls `ptyProcess.resume()` and flushes the queue immediately.
- If the queue exceeds 5 MB, the session is terminated with a `BUFFER_OVERFLOW` error.

---

### 4.2.3 `/ws/claude`

Connects to the Claude Agent SDK. When the connection URL includes `?browserId=<uuid>`, the handler resolves the project root from `BrowserSessionRegistry` (ADR-027) so that each tab's Claude session operates against its own project directory.

#### Client → server

**Query**:
```json
{
  "type": "query",
  "requestId": "req-123",
  "prompt": "Fix the login bug",
  "sessionId": "abc123",
  "options": {
    "maxTurns": 10,
    "maxBudget": 1.0,
    "model": "claude-opus-4-6"
  }
}
```

**Permission response**:
```json
{
  "type": "permission_response",
  "requestId": "perm-456",
  "approved": true
}
```

**Abort**:
```json
{ "type": "abort", "requestId": "req-123" }
```

#### Server → client

Messages wrap the Agent SDK's `SDKMessage` union type as-is. The client branches on `data.type`.

**System init** (session start):
```json
{
  "type": "message",
  "requestId": "req-123",
  "data": {
    "type": "system",
    "subtype": "init",
    "session_id": "abc-123",
    "cwd": "/path/to/project",
    "model": "claude-opus-4-6",
    "tools": ["Bash", "Edit", "Read", "..."],
    "permissionMode": "default"
  }
}
```

**Assistant message** (content block array with text/tool_use mixed):
```json
{
  "type": "message",
  "requestId": "req-123",
  "data": {
    "type": "assistant",
    "message": {
      "content": [
        { "type": "text", "text": "I'll edit the file now." },
        { "type": "tool_use", "id": "toolu_01...", "name": "Edit", "input": { "file_path": "src/auth.ts", "old_string": "...", "new_string": "..." } }
      ],
      "usage": { "input_tokens": 3, "output_tokens": 17 }
    },
    "session_id": "abc-123"
  }
}
```

**User message** (tool results, not shown in the UI):
```json
{
  "type": "message",
  "data": {
    "type": "user",
    "message": { "content": [{ "type": "tool_result", "tool_use_id": "toolu_...", "content": "ok" }] }
  }
}
```

**Permission request** (emitted from the SDK `canUseTool` callback):
```json
{
  "type": "permission_request",
  "requestId": "perm-456",
  "tool": "Bash",
  "args": { "command": "npm test" },
  "danger": "safe"
}
```
`danger` is one of `safe` | `warning` | `danger`, determined by pattern matching on the server (`rm -rf`, `sudo`, `curl ... | sh`, etc.).

**Final result** (Agent SDK `SDKResultMessage`):
```json
{
  "type": "result",
  "requestId": "req-123",
  "data": {
    "type": "result",
    "subtype": "success",
    "result": "final assistant response text",
    "total_cost_usd": 0.008,
    "duration_ms": 1985,
    "num_turns": 1,
    "session_id": "abc-123",
    "usage": {
      "input_tokens": 3,
      "output_tokens": 17,
      "cache_read_input_tokens": 15165
    },
    "permission_denials": []
  }
}
```
`subtype`: `success`, `error_during_execution`, `error_max_turns`, `error_max_budget_usd`, `error_max_structured_output_retries`.

**Error**:
```json
{
  "type": "error",
  "requestId": "req-123",
  "message": "Session not found",
  "code": 4404
}
```

---

### 4.2.4 `/ws/files`

Broadcasts file-change events collected by `@parcel/watcher` (see ADR-024). When `?browserId=<uuid>` is present, the connection is associated with that tab's project root from `BrowserSessionRegistry` (ADR-027). File watchers are ref-counted per project root: the first tab to open a given root starts the `@parcel/watcher` subscription, subsequent tabs share it, and the subscription is torn down only when the last tab referencing that root disconnects or switches away. `project-changed` events are sent only to the originating tab, not broadcast to all clients.

#### Client → server

**Set watch directory**:
```json
{ "type": "watch", "path": "/Users/dev/myproject" }
```

#### Server → client

**File change event**:
```json
{
  "type": "change",
  "event": "change",
  "path": "src/lib/auth.ts",
  "timestamp": "2026-04-11T09:00:00.000Z"
}
```

**Event types**: `add`, `change`, `unlink`, `ready`, `error` — the native watcher's `create`/`update`/`delete` events are normalized to this shape, plus subscription ready / failure signals

---

## 4.3 Connection Management

### Reconnection strategy

```typescript
class ReconnectingWebSocket {
  private backoff = 1000;  // start at 1 s
  private readonly maxBackoff = 30000;  // cap at 30 s

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onopen = () => {
      this.backoff = 1000;  // reset
    };
  }

  private scheduleReconnect() {
    setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
  }
}
```

### Heartbeat

The server sends a WebSocket ping every 29 seconds (browsers default to a 30-second idle timeout).

```typescript
setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.isAlive === false) return client.terminate();
    client.isAlive = false;
    client.ping();
  });
}, 29000);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});
```

---

## 4.4 Error Code Definitions

| Code | Meaning | HTTP status |
|------|---------|-------------|
| 4400 | Bad request (missing/invalid parameter) | 400 |
| 4401 | Authentication failure | 401 |
| 4403 | Path sandbox violation / no permission | 403 |
| 4404 | Resource not found (file/session) | 404 |
| 4413 | File size exceeded | 413 |
| 4429 | Rate limit exceeded | 429 |
| 5500 | Internal server error | 500 |
| 5501 | Claude CLI execution failure | 500 |
| 5502 | PTY process creation failure | 500 |
| 5503 | File system operation failure | 500 |
| 5504 | WebSocket disconnection | — |

### Error response example

```json
{
  "success": false,
  "error": "Path outside project root",
  "code": 4403,
  "details": {
    "requestedPath": "../../../etc/passwd"
  }
}
```
