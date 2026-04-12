# 5. Security Architecture

> English mirror of [`docs/architecture/05-security-architecture.md`](../../architecture/05-security-architecture.md).

## 5.1 Threat Model

ClaudeGUI runs locally, but the following threats must still be mitigated.

| Threat ID | Threat | Impact | Mitigation |
|-----------|--------|--------|------------|
| T-01 | Path traversal | Exposure of files outside the project | `resolveSafe()` bound check (§5.2) |
| T-02 | CLI command injection | Arbitrary command execution | JSON encapsulation, escaping (§5.5) |
| T-03 | XSS (preview) | Browser session hijack | iframe sandbox, sanitize (§5.4) |
| T-04 | Network exposure | Unauthorized remote access | localhost binding (§5.3) |
| T-05 | Symlink escape | Sandbox bypass | `fs.lstat()` validation (§5.2) |
| T-06 | Dotfile exposure | Secret leakage (`.env`, `.git`) | Deny list (§5.2) |
| T-07 | Arbitrary Claude commands | Cost run-up, file damage | Permission request UI (§5.5) |
| T-08 | WebSocket hijacking | Session theft | Origin validation, CSRF token |
| T-09 | Memory exhaustion | DoS | File size limit, rate limiting |
| T-10 | API key exposure | Claude credential leakage | Server-only storage, env vars |

---

## 5.2 File System Sandboxing

### 5.2.1 resolveSafe implementation pattern

```typescript
// src/lib/fs/resolve-safe.ts
import path from 'node:path';
import fs from 'node:fs/promises';

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();

const DENIED_SEGMENTS = new Set([
  '.env', '.git', '.ssh', '.claude', '.aws',
  'id_rsa', 'id_ed25519', '.npmrc',
]);

export async function resolveSafe(userPath: string): Promise<string> {
  // 1. resolve to absolute path
  const resolved = path.resolve(PROJECT_ROOT, userPath);

  // 2. ensure inside the project root
  const rel = path.relative(PROJECT_ROOT, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new SandboxError('Path outside project root', 4403);
  }

  // 3. block dotfiles
  for (const segment of rel.split(path.sep)) {
    if (DENIED_SEGMENTS.has(segment)) {
      throw new SandboxError(`Access denied: ${segment}`, 4403);
    }
  }

  // 4. validate symbolic links
  try {
    const stat = await fs.lstat(resolved);
    if (stat.isSymbolicLink()) {
      const target = await fs.readlink(resolved);
      const targetAbs = path.resolve(path.dirname(resolved), target);
      const targetRel = path.relative(PROJECT_ROOT, targetAbs);
      if (targetRel.startsWith('..') || path.isAbsolute(targetRel)) {
        throw new SandboxError('Symlink points outside project', 4403);
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    // allow when the file does not yet exist (e.g., writes)
  }

  return resolved;
}
```

### 5.2.2 Apply to every filesystem API

```typescript
// src/app/api/files/read/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userPath = searchParams.get('path');
  if (!userPath) return badRequest('path required');

  try {
    const safePath = await resolveSafe(userPath);
    const content = await fs.readFile(safePath, 'utf-8');
    return Response.json({ success: true, data: { content } });
  } catch (err) {
    if (err instanceof SandboxError) return forbidden(err.message);
    throw err;
  }
}
```

### 5.2.3 Restrict the `@parcel/watcher` watch scope

```typescript
import watcher from '@parcel/watcher';

const subscription = await watcher.subscribe(
  PROJECT_ROOT,
  (err, events) => {
    if (err) return; // errors are broadcast separately
    for (const ev of events) {
      if (isIgnoredByWatcher(ev.path)) continue; // JS-side dotfile / .DS_Store filter
      // ev.type: 'create' | 'update' | 'delete'
      // ev.path: absolute path
    }
  },
  {
    // Native ignore — these subtrees are never scanned or subscribed to
    ignore: [
      '**/node_modules', '**/node_modules/**',
      '**/.next',        '**/.next/**',
      '**/.git',         '**/.git/**',
      '**/.claude',      '**/.claude/**',
      '**/dist',         '**/dist/**',
      '**/build',        '**/build/**',
      '**/out',          '**/out/**',
      '**/coverage',     '**/coverage/**',
      '**/test-results', '**/test-results/**',
      '**/playwright-report', '**/playwright-report/**',
      '**/.turbo',       '**/.turbo/**',
      '**/.cache',       '**/.cache/**',
      '**/.claude-worktrees', '**/.claude-worktrees/**',
    ],
  },
);
```

- `@parcel/watcher` uses the OS-native APIs (FSEvents / inotify / ReadDirectoryChangesW), so it never recursively descends symlinks — no explicit `followSymlinks: false` flag is needed.
- The native ignore globs prevent the watcher from scanning `node_modules` and similarly heavy trees at all, which eliminates the FD-exhaustion `EMFILE` crash that chokidar v5 hits on macOS (see ADR-024).
- `.claude-project` is intentionally **not** in the ignore list because it holds user-facing project settings; the general dotfile policy is enforced by the JS-side `isIgnoredByWatcher` filter.

---

## 5.3 Network Security

### 5.3.1 Localhost binding

```javascript
// server.js
const server = http.createServer(handler);

const HOST = process.env.HOST || '127.0.0.1';  // default to localhost
const PORT = process.env.PORT || 3000;

server.listen(PORT, HOST, () => {
  console.log(`> Ready on http://${HOST}:${PORT}`);
});
```

Only set `HOST=0.0.0.0` explicitly when external exposure is required. In that case the following must be added:

- Token-based authentication
- HTTPS/WSS (TLS)
- Strict CORS configuration

### 5.3.2 Remote access options (recommended order)

1. **SSH tunneling**:
   ```bash
   ssh -L 3000:localhost:3000 user@remote
   ```
2. **Cloudflare Tunnel**:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. **Tailscale** or VPN: access from a trusted network
4. **Direct exposure (not recommended)**: must enforce authentication and TLS

### 5.3.3 WebSocket Origin validation

```typescript
wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  const allowed = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  if (!allowed.includes(origin || '')) {
    ws.close(1008, 'Origin not allowed');
    return;
  }
  // ... normal processing
});
```

### 5.3.4 CSRF protection

- REST API: SameSite cookies + CSRF token (for state-changing operations)
- WebSocket: token validation on connection

---

## 5.4 iframe Preview Security

### 5.4.1 Sandbox configuration

```tsx
<iframe
  srcDoc={htmlContent}
  sandbox="allow-scripts"       // allow-same-origin is strictly forbidden
  referrerPolicy="no-referrer"
  loading="lazy"
/>
```

### 5.4.2 Why ban `allow-same-origin`?

- Combining `allow-scripts` + `allow-same-origin` **invalidates the sandbox**.
- The iframe would gain access to the parent page's localStorage, cookies, and DOM.
- An XSS attacker could hijack the user session.

### 5.4.3 Parent-child communication

```typescript
// parent
iframe.contentWindow?.postMessage(
  { type: 'UPDATE_STYLE', css: newCss },
  '*'  // targetOrigin: srcDoc iframes have a 'null' origin, so '*' is used
);

// child (e.g., reveal-host.html)
window.addEventListener('message', (e) => {
  // validate parent window
  if (e.source !== window.parent) return;
  // message type whitelist
  if (!['UPDATE_STYLE', 'UPDATE_SLIDE', 'NAVIGATE'].includes(e.data.type)) return;
  // handle safely
});
```

### 5.4.4 CSP headers

```typescript
// Next.js middleware.ts
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
    "worker-src 'self' blob:",                                    // Monaco web workers
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "connect-src 'self' ws: wss: https://cdn.jsdelivr.net",       // Monaco source maps
    "frame-src 'self' data: blob:",                                // iframe srcdoc + blob
  ].join('; '));
  return res;
}
```

### 5.4.5 Markdown sanitization

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeSanitize]}  // required
>
  {markdown}
</ReactMarkdown>
```

**Forbidden**: direct use of `dangerouslySetInnerHTML`.

---

## 5.5 Claude CLI Permission Management

### 5.5.1 Permission interception strategy

The Agent SDK's `canUseTool` callback decides allow/deny immediately before Claude invokes a tool. The implementation lives in the `canUseTool` function inside `server-handlers/claude-handler.mjs` and is evaluated in the following order.

1. **Abort check** — if the user has aborted the query, return `deny` with `interrupt: true` immediately.
2. **Persistent rule match** — reload `.claude/settings.json` and check `permissions.deny` (→ `deny`) and `permissions.allow` (→ `allow`). When a rule matches, an `auto_decision` event is pushed to the browser and surfaced in the chat panel.
3. **User prompt** — if no rule matches, send a `permission_request` event and wait for the modal response.
4. **Modal response handling** — `Allow Once` permits only the current call and leaves no trace. `Always Allow` has the UI first save a rule via `PUT /api/settings` and then send `permission_response: approved=true` — subsequent calls pass through step (2). `Deny` returns `deny`.

```javascript
// server-handlers/claude-handler.mjs (excerpt)
import {
  loadSettings,
  normalizeRules,
  isToolAllowedBySettings,
  isToolDeniedBySettings,
} from '../src/lib/claude/settings-manager.mjs';

const canUseTool = async (toolName, input, { signal }) => {
  if (signal.aborted) {
    return { behavior: 'deny', message: 'Aborted by user', interrupt: true };
  }

  const rules = normalizeRules(await loadSettings());

  if (isToolDeniedBySettings(toolName, rules)) {
    send({ type: 'auto_decision', tool: toolName, decision: 'deny', source: 'settings' });
    return { behavior: 'deny', message: 'Denied by ClaudeGUI deny rule' };
  }
  if (isToolAllowedBySettings(toolName, input, rules)) {
    send({ type: 'auto_decision', tool: toolName, decision: 'allow', source: 'settings' });
    return { behavior: 'allow', updatedInput: input };
  }

  const approved = await requestPermission(toolName, input);
  return approved
    ? { behavior: 'allow', updatedInput: input }
    : { behavior: 'deny', message: 'Denied by user via ClaudeGUI' };
};
```

Rule grammar and matching logic are defined in `src/lib/claude/settings-manager.mjs` (plus the `.ts` mirror) in `normalizeRules`, `matchBashPattern`, and `isToolAllowedBySettings`. `buildAllowRuleForInput` synthesizes the rule string persisted by "Always Allow": non-Bash tools store the bare tool name, Bash uses the first command token to produce `Bash(<token>:*)`.

### 5.5.2 Dangerous command warnings

Bash commands matching the following patterns are flagged with an extra warning:

- `rm -rf`, `rm -r`, `rmdir`
- `sudo`, `su`
- `chmod 777`, `chown`
- `dd`, `mkfs`
- `curl ... | sh`, `wget ... | sh`
- access to `/etc/`, `/System/`, `~/.ssh/`

```typescript
const DANGER_PATTERNS = [
  /\brm\s+-[rfR]+/,
  /\bsudo\b/,
  /\bcurl\s+.*\|\s*(?:sh|bash)/,
  /\/etc\//,
];

function assessDanger(cmd: string): 'safe' | 'warning' | 'danger' {
  for (const p of DANGER_PATTERNS) {
    if (p.test(cmd)) return 'danger';
  }
  return 'safe';
}
```

### 5.5.3 CLI injection prevention

User input passed to Claude must be conveyed via structured JSON.

```typescript
// wrong (string concatenation)
const prompt = `Fix the bug in ${userInput}`;  // risky

// correct (Agent SDK parameters)
query({
  prompt: 'Fix the bug in the file',
  systemPrompt: `Target file: ${escapeForPrompt(userInput)}`,
});
```

---

## 5.6 Data Protection

### 5.6.1 API key handling

- **Principle**: API keys are **never** exposed to the frontend.
- They are injected only into the server via environment variables (`ANTHROPIC_API_KEY`).
- Next.js `.env.local` is included in `.gitignore`.
- Do not use the client-side `process.env.NEXT_PUBLIC_*` prefix for secrets.
- **GUI API Key input**: When a user enters an API key through the login modal, it is saved server-side to the `anthropicApiKey` field of `~/.claudegui/server-config.json` via `POST /api/auth/api-key` (localhost-only). Only a `hasApiKeySaved: boolean` flag is sent to the frontend — the key value itself is never included in any response. On server startup, the saved key is injected into `process.env.ANTHROPIC_API_KEY` (an existing environment variable takes precedence).

### 5.6.2 Session data

- Claude sessions are stored under `~/.claude/projects/` (managed by the Claude CLI).
- ClaudeGUI reads session metadata in read-only fashion.
- Session deletion only occurs on `DELETE /api/sessions/:id`.

### 5.6.3 Sensitive file access restrictions

The following paths are blocked at the API:

```typescript
const BLOCKED_FILES = [
  /\.env(\.|$)/,
  /\.pem$/,
  /\.key$/,
  /id_rsa/,
  /id_ed25519/,
  /credentials(\.|$)/,
  /\.aws\//,
];
```

### 5.6.4 Logging policy

- Do not log file contents, API keys, or full prompts on the server.
- Request logs include only path, method, and status code.
- Error stack traces are verbose only in development mode.

---

## 5.7 Security Checklist

Verify the following before release:

- [ ] Is the server bound to `127.0.0.1`?
- [ ] Do all filesystem APIs use `resolveSafe()`?
- [ ] Is the dotfile deny list up to date?
- [ ] Is `allow-same-origin` absent from all iframes?
- [ ] Is `rehype-sanitize` applied to Markdown rendering?
- [ ] Are API keys managed only via environment variables?
- [ ] Is WebSocket Origin validation enabled?
- [ ] Are CSP headers configured?
- [ ] Does the dangerous-Bash warning logic work?
- [ ] Is rate limiting applied?
- [ ] Are file-size limits enforced?
- [ ] Is `.env.local` included in `.gitignore`?
- [ ] Is the server bound to `127.0.0.1` only when remote access is disabled?
- [ ] Does token authentication work when remote access is enabled?
- [ ] Are server management APIs (`/api/server/*`) accessible only from localhost?

---

## 5.8 Remote Access Security (FR-1300)

### 5.8.1 Token Authentication Middleware

- When remote access is enabled with a token, all HTTP/WebSocket requests undergo token validation.
- **HTTP**: validates `Authorization: Bearer <token>` header.
- **WebSocket upgrade**: validates `?token=<token>` query parameter (browsers cannot send custom headers on upgrade).
- **Localhost exemption**: requests from `127.0.0.1`, `::1`, `::ffff:127.0.0.1` pass without a token.
- Validation failure returns HTTP 401 or WebSocket `HTTP/1.1 401 Unauthorized`.

### 5.8.2 Management API Access Control

- `/api/server/status`, `/api/server/config`, and `/api/server/restart` are accessible only from localhost.
- Prevents remote clients from modifying server settings or triggering restarts.
- Validation: checks that `req.headers.host` starts with `127.0.0.1`, `localhost`, or `[::1]`.

### 5.8.3 Token Management

- Tokens are generated with `crypto.randomUUID()` (UUID v4), ensuring sufficient entropy (122 bits).
- Tokens are stored in plaintext in `~/.claudegui/server-config.json`. File permissions of 600 (user-only) are recommended.
- The `?token=` parameter in WebSocket URLs may be visible in proxy logs; for production environments, SSH tunneling or a TLS proxy is recommended.

### 5.8.4 CORS Policy

- Local mode: existing `ALLOWED_ORIGINS` validation is maintained.
- Remote mode + token: token authentication replaces Origin validation. Any origin with a valid token is allowed.
- Remote mode + no token: warning logged, all origins allowed (recommended only for development/testing).

## 5.9 MCP Server Security (FR-1400)

### 5.9.1 Permission Management

- MCP server tool calls pass through the existing `canUseTool` callback (§5.5) within the Agent SDK.
- MCP tools follow the same allow/deny flow as built-in SDK tools (`Read`, `Write`, `Bash`, etc.).
- The `permissions.allow`/`permissions.deny` rules in `.claude/settings.json` apply to MCP tools as well.

### 5.9.2 Credential Protection

- MCP server configuration may include API keys and tokens in environment variables (`env` field) and headers (`headers` field).
- These values are stored in plaintext in `.claude/settings.json`; file permissions of 600 (user-only) are recommended.
- In the management modal, environment variable values and header values are displayed as `type="password"` inputs (masked).
- The MCP configuration API (`/api/mcp`) is server-side only; credentials are not directly exposed to the client browser.

### 5.9.3 Process Isolation

- stdio-type MCP servers are spawned as child processes by the Agent SDK, isolated from the main server.js process.
- SSE/HTTP-type MCP servers are network connections to external services and do not execute code within the server process.
- MCP server configuration is isolated per-project, preventing one project's MCP servers from accessing another project's files.
