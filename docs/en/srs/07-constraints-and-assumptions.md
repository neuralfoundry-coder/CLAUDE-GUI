# 7. Constraints and Assumptions

> English mirror of [`docs/srs/07-constraints-and-assumptions.md`](../../srs/07-constraints-and-assumptions.md).

## 7.1 Technical Constraints

### TC-01: Custom server required

- A Next.js custom `server.js` is required for WebSocket-based real-time communication (terminal, Claude streaming, file watching).
- Deployment on serverless platforms such as Vercel or Netlify is not possible.
- Next.js Automatic Static Optimization is disabled.

### TC-02: node-pty native build dependency

- `node-pty` is a C++ native module and requires the following build tools:
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools + Python 3
  - Linux: `build-essential`, `python3`
- On platforms without prebuilt binaries, a manual build may be required.

### TC-03: Monaco Editor bundle size

- The Monaco Editor core bundle is 5–10 MB.
- The CDN loader (`@monaco-editor/loader`) is used to keep it out of the initial bundle.
- Offline environments require either a custom CDN mirror or local bundling.

### TC-04: `@parcel/watcher` native binary

- File watching is implemented with `@parcel/watcher` v2, a native addon backed by FSEvents (macOS), inotify (Linux), and ReadDirectoryChangesW (Windows).
- A prebuilt binary is shipped for each supported OS × CPU combination (`darwin-x64`, `darwin-arm64`, `linux-x64-glibc`, `linux-x64-musl`, `linux-arm64-glibc`, `win32-x64`, …); npm picks the right one at install time.
- On unsupported platforms the package falls back to building from source, which requires Python 3, `make`, and a C++ toolchain (`node-gyp`).
- chokidar v5 is no longer used: from v4 onward it dropped the native fsevents path and falls back to `fs.watch` on macOS, which consumes one file descriptor per directory and crashes with `EMFILE` once the 256 FD per-process soft limit is reached (see ADR-024).

### TC-05: WebSocket / Next.js HMR conflict

- When handling WebSocket upgrades on the custom server, the Next.js HMR WebSocket (`/_next/webpack-hmr`) must be routed separately.
- Application WebSocket and HMR WebSocket must be split on the same HTTP server.

### TC-06: Browser filesystem access restrictions

- Browsers cannot access the local filesystem directly.
- File system operations must go through the Node.js server bridge.
- The Chrome File System Access API may be used only as a supplement (not supported by all browsers).

---

## 7.2 Business Constraints

### BC-01: Single-user environment

- ClaudeGUI is a local developer tool; it does not support multi-user or multi-tenant scenarios.
- It runs with the current OS user's privileges on the local machine.
- Concurrent access by multiple users to the same instance is not a supported scenario.

### BC-02: No persistent storage (v1.0)

- ClaudeGUI v1.0 does not use its own database.
- Claude session data is managed by the Claude CLI under `~/.claude/projects/`; ClaudeGUI reads that directory in a read-only fashion.
- UI preferences such as panel sizes and themes are persisted in the browser's `localStorage`.
- The server is stateless; only in-memory session state (PTY, WS connections) is lost on process restart.
- If metadata storage requirements arise, the introduction of a `migrations/` directory will be re-evaluated.

### BC-02: Claude subscription required

- Using the Claude CLI requires an Anthropic Claude Pro, Max, Team, or Enterprise subscription.
- An API key (`ANTHROPIC_API_KEY`) or auth token (`ANTHROPIC_AUTH_TOKEN`) must be configured.

### BC-03: Open-source license compatibility

- All open-source libraries must have licenses compatible with the project license.
- reveal.js: MIT license (check commercial feature licenses separately)
- Monaco Editor: MIT license
- xterm.js: MIT license

---

## 7.3 Assumptions

### A-01: Claude CLI pre-installed

- We assume the user has installed the `claude` CLI and placed it on `PATH` before launching ClaudeGUI.
- CLI version compatibility is tracked against the latest stable release.

### A-02: Authentication completed

- We assume the user has completed Claude CLI authentication (`claude login` or API-key setup).
- ClaudeGUI does not provide its own authentication flow.

### A-03: Agent SDK API stability

- We assume the core API of `@anthropic-ai/claude-agent-sdk` (`query()`, `startup()`, event types) maintains backward compatibility.
- Major breaking changes may require a ClaudeGUI update.

### A-04: Network availability

- We assume internet connectivity for Anthropic API calls.
- When offline, Claude-related features are disabled; only the editor, terminal, and file explorer function.

### A-05: Project size

- We target typical software projects (thousands to tens of thousands of files).
- Extremely large monorepos with a million+ files are outside the performance guarantee.

---

## 7.4 Dependency Matrix

### Core dependencies

| Package | Minimum version | Role | Risk |
|---------|-----------------|------|------|
| `next` | 14.0 | App framework | App Router API change |
| `react` | 18.2 | UI library | React 19 migration |
| `@anthropic-ai/claude-agent-sdk` | latest | CLI integration | API breaking changes |
| `@monaco-editor/react` | 4.6 | Code editor | Monaco version compatibility |
| `@xterm/xterm` | 5.0 | Terminal | xterm.js 6.x migration |
| `node-pty` | 1.0 | PTY backend | Native build failure |
| `react-resizable-panels` | 2.0 | Panel layout | — |
| `react-arborist` | 3.4 | File tree | — |
| `ws` | 8.0 | WebSocket server | — |
| `@parcel/watcher` | 2.5 | File watching (native FSEvents/inotify backend) | Source build required on unsupported platforms |
| `reveal.js` | 5.0 | Presentations | — |
| `zustand` | 5.0 | State management | — |
| `react-pdf` | 10.0 | PDF rendering | pdf.js compatibility |
| `react-markdown` | 9.0 | MD rendering | — |
| `cmdk` | 1.0 | Command palette | — |
| `PptxGenJS` | 3.0 | PPTX export | — |

### Dependency update strategy

- **Weekly**: `npm audit` to check for security vulnerabilities
- **Monthly**: review minor version updates
- **Quarterly**: evaluate major version updates and plan migrations
- **Immediately**: urgent patch when a security vulnerability is discovered

---

## 7.5 Risk Management

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Agent SDK API change | High | Medium | Abstract behind an SDK wrapper layer; pin versions |
| Claude CLI output format change | High | Low | Isolate the NDJSON parser; integration tests |
| node-pty build failure | Medium | Medium | Provide a Docker build environment; prebuilt binaries |
| Monaco CDN availability | Medium | Low | Local bundle fallback option |
| Browser API change | Low | Low | Monitor Chrome release notes |
| reveal.js license change | Medium | Low | Alternatives: evaluate Marp, Slidev |
