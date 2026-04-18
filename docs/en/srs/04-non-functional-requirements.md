# 4. Non-Functional Requirements

> English mirror of [`docs/srs/04-non-functional-requirements.md`](../../srs/04-non-functional-requirements.md).

## 4.1 Performance (NFR-100)

### NFR-101: Initial load time

- The application shall finish its initial load **within 3 seconds** (local environment).
- Monaco Editor shall use CDN loading to minimize bundle size.
- Code splitting shall be applied so that the initial bundle contains only essential components.

### NFR-102: Terminal input latency

- The target from user keystroke to screen update is **within 16 ms** (60 FPS sync).
- Terminal output is batched and rendered in **16 ms** windows.

### NFR-103: File tree performance

- Smooth scrolling (60 FPS) shall be maintained even for projects with **10,000 files**.
- Virtualized rendering shall create DOM nodes only for visible rows.

### NFR-104: Preview refresh latency

- The preview shall refresh **within 500 ms** after an editor change.
  - Markdown → HTML: within 300 ms
  - HTML iframe update: within 100 ms
  - PDF page render: within 500 ms (single page)

### NFR-105: WebSocket reconnection

- The client shall automatically retry after a disconnect.
- Exponential backoff: start at 1 second with a **30-second cap**.
- The reconnection state shall be visually indicated to the user.

### NFR-106: Editor tab switching

- Switching tabs shall show the new file content **within 50 ms**.
- Monaco models shall be cached in memory to avoid re-creation.

### NFR-107: Memory management

- No memory leaks shall occur during extended use.
- Terminal scrollback buffer: up to **10,000 lines** (older data is discarded).
- Monaco models for closed tabs shall be released after a grace period.

---

## 4.2 Security (NFR-200)

### NFR-201: Network binding

- The server shall bind to `127.0.0.1` (localhost) only by default.
- Remote access is permitted only via SSH tunnel or Cloudflare Tunnel.
- Token-based authentication shall be enforced if exposed externally.

### NFR-202: Path traversal prevention

- All filesystem APIs shall perform `path.resolve()`-based bound checks.
- Paths outside the project root shall be answered with `403 Forbidden`.

### NFR-203: iframe sandbox

- The HTML preview iframe shall apply `sandbox="allow-scripts"`.
- `allow-same-origin` shall **never** be used.
- `referrerpolicy="no-referrer"` shall be applied.

### NFR-204: Dotfile access block

- Access to sensitive dotfiles/dot-directories (`.env`, `.git`, `.claude`, `.ssh`, etc.) shall be blocked at the API level.

### NFR-205: Symbolic link validation

- `fs.lstat()` shall be used to check whether a path is a symbolic link before access.
- If a symlink points outside the project root, access shall be denied.

### NFR-206: File size limits

- Read/write APIs shall enforce file-size limits.
  - Text files: up to **10 MB**
  - Binary files: up to **50 MB**
- Exceeding the limit shall return `413 Payload Too Large`.

### NFR-207: Request rate limiting

- Rate limiting shall be applied to file-system APIs.
- Default: **300 requests per minute per IP** (configurable).

### NFR-208: XSS prevention

- Markdown rendering shall apply sanitize options.
- User input inserted into HTML shall be escaped.
- `dangerouslySetInnerHTML` shall not be used.

### NFR-209: CLI command injection prevention

- User input passed to the Claude CLI shall be JSON-encapsulated.
- Shell metacharacters (`|`, `;`, `&&`, `` ` ``, etc.) shall not be forwarded directly.

---

## 4.3 Usability (NFR-300)

### NFR-301: VS Code-like keybindings

- Default keybindings shall match VS Code.
- Major shortcuts `Cmd+P`, `Cmd+B`, `Cmd+J`, `Cmd+S`, `Cmd+K`, etc., shall be supported.

### NFR-302: Theme support

- Five themes shall be provided: **dark (default)**, **light**, **high-contrast**, **Retro — Green Phosphor** (v0.3), and **system** (v0.5).
- The **system** theme auto-detects the OS preference via `window.matchMedia('(prefers-color-scheme: dark)')` and dynamically follows changes. When the OS switches between dark and light mode, the app updates in real time without user intervention.
- The `color-scheme` CSS property shall be set on each theme class to ensure that native UI elements (scrollbars, form controls, selection highlights) follow the app theme independently of the OS mode.
- An inline script in `layout.tsx` shall read the persisted theme from `localStorage` before React hydration to prevent a flash of unstyled content (FOUC).
- Switching themes shall consistently update every panel (editor, terminal, file tree, preview).
- The retro theme offers an optional CRT scanline overlay (`retroScanlines` flag) and uses `VT323` → `IBM Plex Mono` → `monospace` as its font stack.
- Theme selection shall be available from the command palette or the settings UI.

### NFR-303: WAI-ARIA accessibility

- Key UI elements shall use WAI-ARIA attributes.
- Semantic markup shall be used.
- Screen-reader compatibility shall be ensured.

### NFR-304: Keyboard navigation

- All primary functions shall be operable via the keyboard alone.
- Focus order: file explorer → editor → terminal → preview.
- Focus-movement shortcuts shall be provided.

### NFR-305: High-contrast theme

- A high-contrast theme option shall be provided for visual accessibility.

### NFR-306: Font size adjustment

- Users shall be able to adjust editor and terminal font size.
- `Cmd+`/`Cmd-` shall provide quick adjustment.

### NFR-307: API error user notifications

- API call failures (network errors, server errors, etc.) shall be shown to the user immediately via toast notifications.
- Toasts auto-dismiss after 5 seconds and can be manually closed.
- Up to 5 toasts are displayed simultaneously; older ones are automatically removed.
- Implementation: `src/stores/use-toast-store.ts`, `src/components/layout/toast-container.tsx`, `src/lib/api-client.ts` (`showErrorToast`)

---

## 4.4 Compatibility (NFR-400)

### NFR-401: Browser support

- The latest two **Chrome** versions are officially supported.
- Firefox, Safari, and Edge are supported on a best-effort basis.

### NFR-402: Operating system support

- macOS 13+, Windows 10+, and Ubuntu 20.04 LTS+ shall be supported.
- `node-pty` native modules shall build successfully on each OS.

### NFR-403: Minimum resolution

- Resolutions of **1280 × 720** or higher shall be supported.
- Below 1280px viewport width, the UI falls back to a **single-panel tab mode**. A bottom tab bar (Files, Editor, Terminal, Claude, Preview) provides navigation between panels, displaying only one panel full-screen at a time.

### NFR-404: Node.js compatibility

- Node.js **20.x–24.x** (LTS **22.x** recommended) shall be supported.
- The runtime shall be able to load `@parcel/watcher` v2 native binaries, node-pty prebuilds, and ESM dynamic imports.

---

## 4.5 Maintainability (NFR-500)

### NFR-501: TypeScript strict mode

- Type safety shall be guaranteed with `strict: true`.
- Use of `any` is forbidden.

### NFR-502: Test coverage

- Components and utility functions shall maintain **≥ 70%** test coverage.
- Core modules (filesystem API, WebSocket handlers, permission management) shall maintain **≥ 90%**.

### NFR-503: Code quality

- ESLint + Prettier shall enforce a consistent code style.
- Linting and format checks shall run automatically in CI.

### NFR-504: Modularity

- Each panel component shall be independently testable.
- Zustand stores shall be split using the slice pattern.
- Server-side handlers (terminal, Claude, files) shall be organized as independent modules.

### NFR-505: Documentation

- Public APIs (REST, WebSocket) shall be documented.
- Architecture Decision Records (ADRs) shall be maintained.

### NFR-506: Panel crash isolation

- A render error in one panel of the 4-panel layout shall not degrade availability of the other panels or the app as a whole.
- Every panel shall be wrapped in a React Error Boundary; on crash, only the affected panel shall render a fallback UI (error message + retry button).
- Errors shall be forwardable to an external collector (e.g., Sentry) via the `registerErrorSink(fn)` API. The default sink is `console.error`.
- Reference: ADR-028, `src/components/layout/error-boundary.tsx`.

### NFR-507: Request cancellation determinism

- When the user closes a streaming Claude tab, the abort signal to the server shall be sent synchronously **before** the tab state is removed from the store.
- The `requestId → tabId` routing map shall be cleared in the same frame as the abort, so late-arriving server responses cannot false-route to a missing tab.
- Asynchronous `import()` or fetch inside a Zustand reducer is forbidden (re-entrancy hazard). Side effects shall run *outside* the reducer via the `request-aborter.ts` registry.
- Reference: ADR-029, `src/lib/claude/request-aborter.ts`.
