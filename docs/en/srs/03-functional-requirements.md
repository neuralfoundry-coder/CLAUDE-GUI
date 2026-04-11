# 3. Functional Requirements

> English mirror of [`docs/srs/03-functional-requirements.md`](../../srs/03-functional-requirements.md).

## 3.1 Panel Layout System (FR-100)

### FR-101: Four-panel composition

- The system shall provide an IDE layout composed of four primary panels.
  - **Left**: file explorer (vertical)
  - **Center top**: code editor
  - **Center bottom**: terminal
  - **Right**: preview panel (vertical)
- It shall be implemented with `react-resizable-panels` v4.

### FR-102: Panel resize

- Users shall be able to resize panels by dragging the handles on panel borders.
- Minimum sizes shall be enforced so a panel cannot fully disappear.

### FR-103: Panel collapse/expand

- Each panel shall be collapsible and expandable.
- When collapsed, panels may display icons only (`collapsedSize: 4px`) or be fully hidden (`collapsedSize: 0`).

### FR-104: Layout state persistence

- Panel sizes and collapse states shall be automatically persisted to `localStorage`.
- The `autoSaveId` attribute of `react-resizable-panels` shall be used.
- On browser reload, the last layout state shall be restored.

### FR-105: Nested panel groups

- The center area shall be split vertically into editor (top) and terminal (bottom).
- Nested `PanelGroup` structures shall be supported.

---

## 3.2 File Explorer (FR-200)

### FR-201: Directory tree rendering

- The project directory shall be displayed as a recursive tree.
- Virtualized rendering shall be performed based on `react-arborist` v3.4.
- 60 FPS scrolling shall be maintained even with thousands of files.

### FR-202: File/folder CRUD

- Creation, rename (F2), and deletion of files and folders shall be supported.
- Deletion shall trigger a confirmation dialog.

### FR-203: Drag and drop

- Files and folders shall be movable to other directories via drag-and-drop.

### FR-204: Git status display

- Git status shall be indicated visually next to file names.
  - Modified (M) — yellow
  - Added (A) — green
  - Deleted (D) — red
  - Untracked (U) — light green
  - Renamed (R) — blue
  - Conflicted (!) — dark red
- Implementation: `GET /api/git/status` parses `git status --porcelain` output and returns a path-to-status map.
- If the project is not a Git repository, the response is `isRepo: false` and no indicator is displayed.

### FR-205: File icon mapping

- Appropriate icons shall be displayed based on file extension.
- Supported extensions include: `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.md`, `.html`, `.css`, `.py`, `.go`, `.rs`, etc.

### FR-206: Context menu

- Right-clicking a file or folder shall open a context menu.
- Menu items: New File, New Folder, Rename, Delete, Copy Path, Open in Terminal.

### FR-207: Virtualized rendering

- Only nodes visible on screen shall be rendered to the DOM, to support large projects.
- `react-arborist`'s built-in virtualization shall be used.

---

## 3.3 Code Editor (FR-300)

### FR-301: Monaco Editor integration

- Monaco Editor shall be integrated via the `@monaco-editor/react` package.
- The CDN loader shall be used to optimize bundle size.

### FR-302: Multi-tab support

- Multiple files shall be openable simultaneously as tabs.
- Each tab shall maintain an independent Monaco model.
- Closing tabs and reordering tabs via drag shall be supported.

### FR-303: Syntax highlighting

- Monaco's built-in syntax highlighting shall support more than 100 languages.
- The language mode shall be auto-detected from the file extension.

### FR-304: State preservation

- The following state shall be preserved when switching tabs:
  - Cursor position
  - Scroll position
  - Undo/Redo history
  - Selection

### FR-305: AI change accept/reject UI

- When Claude modifies a file, the changes shall be shown in a diff view.
- Users shall be able to **Accept** or **Reject** the changes.
- Partial acceptance (selected hunks only) shall be supported.

### FR-306: Editor lock mode

- While Claude is editing a file, the corresponding tab shall be switchable to read-only mode.
- The locked state shall be visually distinguished (icon or badge).

### FR-307: File save

- `Cmd+S` (macOS) / `Ctrl+S` (Windows/Linux) shall save the current file.
- Writes happen via the REST API `/api/files/write` to the server-side filesystem.
- Tabs with unsaved changes shall be marked with a dot indicator.

### FR-308: Live reflection of external changes

- External file changes detected by chokidar shall be reflected in the editor in real time.
- Change events are received via the WebSocket `/ws/files` channel.
- Content is updated while preserving the user's cursor position.
- If the editor has unsaved changes, a conflict notification shall be displayed.

---

## 3.4 Terminal (FR-400)

### FR-401: Terminal emulation

- Full terminal emulation shall be provided based on `@xterm/xterm` v5.
- It shall connect to server-side `node-pty` sessions through WebSocket `/ws/terminal`.

### FR-402: ANSI escape code rendering

- 256-color ANSI, bold, italic, underline, blink, and other styles shall be rendered.
- Cursor-movement and screen-clear escape sequences shall be handled.

### FR-403: GPU-accelerated rendering

- GPU-accelerated rendering shall be applied using the xterm.js WebGL addon.
- Smooth rendering shall be maintained even with heavy terminal output (log streaming, etc.).

### FR-404: Resize sync

- When the terminal panel is resized, the PTY's `cols`/`rows` shall be synchronized.
- Auto-resizing shall be performed via the xterm.js `fit` addon.
- Resize events shall be sent to the server via WebSocket as `{ type: "resize", cols, rows }`.

### FR-405: Buffer search

- `Ctrl+F` shall search text within the terminal buffer.
- The xterm.js `search` addon shall be used.

### FR-406: Clickable URLs

- URLs in terminal output shall be auto-detected and rendered as clickable links.
- The xterm.js `web-links` addon shall be used.

### FR-407: Backpressure control

- Watermark-based backpressure control shall be applied when terminal output is excessive.
  - High watermark: 100 KB — pause inbound data
  - Low watermark: 10 KB — resume inbound data
- The 50 MB buffer ceiling shall not be exceeded.

### FR-408: Multiple terminal sessions

- Multiple terminal sessions shall be creatable and switchable simultaneously.
- Each session shall be bound to an independent PTY process.

---

## 3.5 Claude CLI Integration (FR-500)

### FR-501: Agent SDK integration

- The Claude Code process shall be managed via `@anthropic-ai/claude-agent-sdk`.
- The SDK shall be used instead of calling `child_process.spawn()` directly, for reliability.
- Pre-warming via the `startup()` method (≈20× faster first query) shall be supported.

### FR-502: Streaming response display

- `SDKMessage` events shall be received in real time from the Agent SDK's `query()` async iterator.
- Handling per message type:
  - `system` (subtype `init`): capture session id, model, and available tool list
  - `assistant`: iterate `message.content[]` blocks — `text` blocks are shown as assistant messages, `tool_use` blocks as tool messages
  - `user`: tool-execution feedback — not surfaced in the UI
  - `result`: final result (`total_cost_usd`, `usage.input_tokens`/`output_tokens`, `session_id`, `subtype`)

### FR-503: Session management

- **Create new session**: start a new conversation scoped to the project directory
- **Resume session**: continue an existing conversation by session ID
- **Fork session**: branch from an existing session into a new conversation
- **Name session**: let the user label a session
- The session list is derived from `~/.claude/projects/`.

### FR-504: Cost and token-usage display

- The token usage (input/output) for each query shall be displayed.
- The cumulative cost for a session shall be displayed.
- The `cost_usd` and `usage` fields of the `result` message shall be used.
- **Session Info Bar**: A collapsible bar at the bottom of the Claude chat panel
  shall expose the stats of the currently active session.
  - Collapsed (default): a single line (height 24px) showing the model name,
    turn count, total token count, cumulative cost, and last-updated relative
    time. The bar defaults to collapsed so it does not encroach on the editor.
  - Expanded: a tabular view showing session ID, model, `num_turns`,
    `duration_ms`, input/output/cache-read tokens, cumulative cost
    (`total_cost_usd`), and the relative "updated" timestamp.
  - Values shall be sourced only from fields the Agent SDK actually emits
    (`system.init.model`, and `result.num_turns` / `duration_ms` / `usage.*` /
    `total_cost_usd`). Values the SDK does not provide — including context
    window size — shall not be hardcoded or estimated; until data arrives,
    every field shall be rendered as "-".
  - Stats shall accumulate per session in
    `sessionStats: Record<string, SessionStats>`; only the active session's
    snapshot is displayed. Updates arrive via WebSocket push, so no polling
    is performed.
  - Expanded/collapsed state shall be persisted to `localStorage` and restored
    on return visits.

### FR-505: Permission-request interception

- When Claude requests a tool invocation, a GUI modal shall be shown via the Agent SDK's `canUseTool` callback option.
- The modal shall include:
  - The requested tool name
  - Arguments (file path, command, etc.)
  - Risk badge (`safe` / `warning` / `danger`)
  - **Approve** / **Deny** buttons
- On denial, returning `{ behavior: 'deny', message }` to the SDK causes Claude to abandon that tool use and seek alternatives.
- Physical user clicks are required (no auto-approval).
- In `permissionMode: 'default'`, the Agent SDK may auto-approve safe actions (reads, simple Bash commands). In that case `canUseTool` is not called, and the tool use is recorded only as a tool message in the chat panel.

### FR-506: Auto-approval rules

- Auto-approval shall be supported via the whitelist in `.claude/settings.json`.
- Auto-approved tool calls shall be marked with an "Auto-approved" badge.
- A settings screen shall provide editing of auto-approval rules from the GUI.

### FR-507: Tool-usage visualization

- Claude's current activity shall be displayed in real time:
  - Currently-read file
  - Running search query
  - Name of the tool being invoked
- The file explorer shall highlight files Claude is currently accessing.

### FR-508: Execution limits

- `max-turns`: maximum number of conversation turns
- `max-budget`: maximum cost per session (USD)
- When a limit is hit, the user shall be notified and asked to confirm.

### FR-509: Context compaction

- Context compaction via the `/compact` command shall be supported.
- Context usage shall be displayed, and an automatic notification shall be raised when the threshold is reached.

### FR-510: Auth status indicator (v0.3)

- The system shall display the current Claude CLI auth status as a live header badge.
- Auth source must be one of `credentials-file` (`~/.claude/.credentials.json`), `env` (`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`), or `none`.
- A separate `cliInstalled: false` indicator is shown when the CLI is not on `PATH`.
- Clicking an unauthenticated badge opens a modal guiding the user to run `claude login`.
- Implementation: `src/lib/claude/auth-status.ts`, `GET /api/auth/status`, `src/components/layout/auth-badge.tsx`.

### FR-520: Native application run mode (v0.3)

- ClaudeGUI shall be runnable as a native application (`.dmg` / `.msi`) via Tauri v2.
- The app spawns a bundled Node.js sidecar that runs `server.js`; the native webview then connects to `127.0.0.1:<random-port>`.
- On first launch, if the Claude CLI is not already on `PATH`, it is installed into an app-local `node-prefix` and that prefix's `bin` is prepended to the PTY `PATH`.
- Implementation: `installer/tauri/`, `scripts/installer-runtime/ensure-claude-cli.mjs`.

---

## 3.6 Preview Panel (FR-600)

### FR-601: Auto-detect file type

- The appropriate renderer shall be auto-selected based on file extension.
  - `.html` → HTML preview
  - `.pdf` → PDF preview
  - `.md` → Markdown preview
  - `.png`, `.jpg`, `.gif`, `.svg`, `.webp` → image preview
  - `.reveal.html`, presentation mode → reveal.js preview

### FR-602: HTML preview

- HTML shall be rendered via the iframe `srcdoc` attribute.
- `sandbox="allow-scripts"` shall be applied (`allow-same-origin` is forbidden).
- When only CSS changed, styles shall be updated via `postMessage` to avoid reloading the iframe.

### FR-603: PDF preview

- PDF shall be rendered using `react-pdf` (pdf.js 5.x).
- Page navigation (previous/next, direct page-number input) shall be supported.
- A `<Thumbnail>` sidebar may be displayed on the left.
- The PDF.js Web Worker shall be used to avoid blocking the main thread.

### FR-604: Markdown preview

- Rendering shall use `react-markdown` + `remark-gfm` + `rehype-highlight`.
- Supported features: GFM tables, checklists, syntax-highlighted code blocks, LaTeX formulas.
- `---` (horizontal rule) may be treated as a page separator.
- `dangerouslySetInnerHTML` shall be forbidden; sanitize options shall be applied.

### FR-605: Image preview

- Major image formats shall be rendered: PNG, JPEG, GIF, SVG, WebP.
- Zoom/pan shall be provided via `react-zoom-pan-pinch`.
- Large images shall be progressively loaded via streaming.

### FR-606: Debounce-based live refresh

- On editor changes, the preview shall not refresh immediately but shall be debounced by 300 ms.
- Only the changed sections shall be updated (avoid full re-render).

### FR-607: Page navigation UI

- Page navigation shall be provided for multi-page content (PDF, presentations).
- UI elements: previous/next buttons, current/total page display, page jump.

### FR-610: HTML streaming live preview (v0.3)

- The preview panel shall update in real time **independently of the file-selection state** when it detects an HTML code fence (` ```html `) or a `Write`/`Edit` `tool_use` targeting a `.html` file in a Claude assistant response.
- For partial content, if a renderable marker is present (`<!doctype`, `<html`, `<body`, or a balanced top-level tag), the preview renders via iframe `srcdoc`; otherwise it falls back to a source-code view.
- The iframe must be sandboxed with `sandbox="allow-scripts"` and must never use `allow-same-origin`.
- Buffer updates are debounced at 150 ms.
- On query completion (`result`), the extractor finalizes and freezes the final HTML.
- Implementation: `src/lib/claude/html-stream-extractor.ts`, `src/stores/use-live-preview-store.ts`, `src/components/panels/preview/live-html-preview.tsx`.

### FR-611: Preview fullscreen mode (v0.3)

- The preview panel shall provide a fullscreen mode (`position: fixed; inset: 0; z-index: 9999`).
- The user must be able to exit fullscreen with `Esc`.
- Fullscreen state is tracked in `usePreviewStore.fullscreen`.

---

## 3.7 Presentation Features (FR-700)

### FR-701: reveal.js slide rendering

- Slides shall be rendered with reveal.js 5.x running inside an iframe.
- Data model: a JSON array `[{ id, html, css, notes, transition, background }]`.

### FR-702: Slide CRUD

- Adding, deleting, and reordering slides shall be supported.
- Slide-thumbnail navigation shall be provided.

### FR-703: Conversational slide editing

- Users shall be able to request slide edits in natural language.
  - e.g., "Make the title on slide 3 larger"
  - e.g., "Add an architecture diagram to slide 2"
- Claude receives the current slide HTML and returns the modified HTML.
- The result is reflected in the iframe immediately.

### FR-704: Live DOM patching

- The iframe shall not reload when slides are edited.
- The parent page patches `<section>` innerHTML via `postMessage` and then calls `Reveal.sync()`.
- `Reveal.slide(h, v, f)` is used to navigate to a specific slide.

### FR-705: Themes and transitions

- One of reveal.js's 12 built-in themes shall be selectable.
- Per-slide transitions (slide, fade, convex, etc.) shall be configurable.
- Auto-Animate shall be supported.

### FR-706: Speaker notes

- Per-slide speaker notes shall be authorable and editable.
- A speaker view shall be provided in presentation mode.

### FR-707: PPTX export

- Export to `.pptx` shall be supported via `PptxGenJS`.

### FR-708: PDF export

- Export to PDF shall be supported via DeckTape (Puppeteer-based) or reveal.js's `?print-pdf` query.

### FR-709: Editor/preview bidirectional sync

- Selecting a specific slide code in the editor shall navigate the preview to that slide.
- Clicking a slide in the preview shall scroll the editor to the corresponding code.
- `data-index` metadata shall be used.

---

## 3.8 Command Palette and Shortcuts (FR-800)

### FR-801: Command palette

- `Cmd+K` (macOS) / `Ctrl+Shift+P` shall open the command palette.
- It shall be implemented with the `cmdk` library.
- Fuzzy search shall be supported.

### FR-802: Quick open file

- `Cmd+P` / `Ctrl+P` shall support searching and opening files by name.

### FR-803: Toggle sidebar

- `Cmd+B` / `Ctrl+B` shall toggle the file-explorer panel.

### FR-804: Toggle terminal

- `Cmd+J` / `Ctrl+J` shall toggle the terminal panel.

### FR-805: Customize keyboard shortcuts

- A settings screen shall allow users to rebind keyboard shortcuts.

---

## 3.9 File System API (FR-900)

### FR-901: Directory listing

- The REST API `GET /api/files?path=<dir>` shall return directory contents.
- Response: list of files/folders (name, type, size, modification time).

### FR-902: File read/write

- `GET /api/files/read?path=<file>` — read file content
- `POST /api/files/write` — save file content
- Encoding: UTF-8 by default; Base64 for binary files.

### FR-903: File/folder create and delete

- `POST /api/files/mkdir` — create a directory
- `DELETE /api/files?path=<path>` — delete a file or empty folder

### FR-904: File rename/move

- `POST /api/files/rename` — rename or move via `{ oldPath, newPath }`

### FR-905: File metadata

- `GET /api/files/stat?path=<file>` — query size, modification time, and type (file/directory)

### FR-905b: Binary file streaming

- `GET /api/files/raw?path=<file>` — stream binary files (images, PDFs) with Content-Type
- MIME is auto-detected from the extension
- Returns 413 when the file exceeds 50 MB

### FR-906: Path traversal prevention

- All path parameters shall be bound-checked with `path.resolve()`.
- Access outside the project root directory shall be blocked.
- Dotfile (`.env`, `.git`, `.claude`) access shall be blocked by default.
- Symbolic links shall be validated with `fs.lstat()` before being followed.

### FR-907: Real-time file-change detection

- chokidar v5 shall detect file changes in the project directory.
- Change events shall be broadcast on the WebSocket `/ws/files` channel.
- Event types: `add`, `change`, `unlink`, `addDir`, `unlinkDir`.
- Unnecessary directories (`node_modules`, `.git`, etc.) shall be ignored.

### FR-908: Runtime project hot-swap (v0.3)

- The system shall allow switching the project root at runtime (no server restart).
- `GET /api/project` returns the current root plus the recents list.
- `POST /api/project` (body `{ path }`) switches the root after the following checks:
  - Absolute path (relative paths are rejected with `4400`)
  - Directory exists (`4404` / `4400`)
  - Readable (`4403`)
  - Must not be the filesystem root (`/`) or `$HOME` (`4403`)
- On switch:
  - The chokidar watcher is closed on the old root and restarted on the new one.
  - All `/ws/files` clients receive `{ type: 'project-changed', root, timestamp }`.
  - Newly spawned PTY sessions use the new root as `cwd` (existing sessions are left alone).
  - Claude queries also use the new root as `cwd`.
- Clients that receive `project-changed` reset their editor tabs and preview selection and reload the file tree.
- State is persisted to `~/.claudegui/state.json` as `{ lastRoot, recents }`.
- Implementation: `src/lib/project/project-context.mjs`, `src/app/api/project/route.ts`, `src/stores/use-project-store.ts`, `src/components/modals/project-picker-modal.tsx`.
