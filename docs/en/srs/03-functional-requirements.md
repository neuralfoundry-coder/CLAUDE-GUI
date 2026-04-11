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
- Framing is disambiguated by WebSocket frame type:
  - **PTY → client**: shell output is sent as **binary frames** (`ArrayBuffer`). xterm.js decodes UTF-8 internally.
  - **Control messages (both directions)**: `exit`, `error`, `resize`, `input`, `pause`, `resume` are sent as **text JSON frames**.
- Output that happens to start with `{` (e.g. `cat package.json`) is never misinterpreted as a control frame.
- The terminal pipeline shall stay fully separate from the Claude chat input. `/ws/terminal` and `/ws/claude` shall not share symbols or state.
- The server shall spawn the shell in **login + interactive** mode. The shell resolution order, flag mapping, and environment variables are specified in `FR-410`.

### FR-402: ANSI escape code rendering

- 256-color ANSI, bold, italic, underline, blink, and other styles shall be rendered.
- Cursor-movement and screen-clear escape sequences shall be handled.

### FR-403: GPU-accelerated rendering

- GPU-accelerated rendering shall be applied using the xterm.js WebGL addon.
- On WebGL context failure, the renderer shall automatically fall back to canvas.
- Smooth rendering shall be maintained even with heavy terminal output (log streaming, etc.).

### FR-404: Resize sync

- When the terminal panel is resized, the PTY's `cols`/`rows` shall be synchronized.
- Auto-resizing shall be performed via the xterm.js `fit` addon.
- Resize events shall be sent to the server via WebSocket as `{ type: "resize", cols, rows }`.
- PTYs are spawned at a default 120×30, and the first `fit()` after the client attaches to its DOM host overrides this with the real size.
- `fitAddon.fit()` shall also run on tab activation, panel re-expand, and font-size change; a resize event is sent only when the new dimensions differ from the last.

### FR-405: Buffer search

- While the terminal panel has focus, pressing `Cmd/Ctrl+F` shall open a floating search overlay.
- The overlay is anchored to the top-right of the terminal body and offers an input plus three toggles: match case (`Aa`), whole word (`W`), and regex (`.*`).
- On query changes, after a 100 ms debounce, `searchAddon.findNext(query, opts)` performs an incremental search.
- Key interaction: `Enter` (next), `Shift+Enter` (previous), `Esc` (close).
- Closing the overlay calls `searchAddon.clearDecorations()` and restores focus to xterm.
- xterm's `attachCustomKeyEventHandler` vetoes the `Cmd/Ctrl+F` keystroke so it is never written to the PTY.
- Implementation: `src/components/panels/terminal/terminal-search-overlay.tsx` and `TerminalManager.findNext`/`findPrevious`/`clearSearchHighlight`.

### FR-406: Clickable URLs

- URLs in terminal output shall be auto-detected and rendered as clickable links.
- The xterm.js `web-links` addon shall be used.

### FR-407: Backpressure control — no drops

- Watermark-based backpressure shall be applied when terminal output is excessive, and **no data shall ever be silently dropped**.
- Client watermarks (based on xterm.js write backlog):
  - High watermark: **100 KB** — client sends `{type:"pause"}` to the server
  - Low watermark: **10 KB** — client sends `{type:"resume"}` to the server
- Server behavior:
  - On `pause`, the server buffers PTY output in an in-memory queue. Flushing is suspended but data is retained.
  - When the queue exceeds **256 KB**, the server calls `ptyProcess.pause()` to stop the upstream shell and prevent further growth (POSIX only; on Windows this is a no-op).
  - On `resume`, the server calls `ptyProcess.resume()` and immediately flushes the queue, preserving order.
  - If the queue exceeds **5 MB**, the server emits `{type:"error", code:"BUFFER_OVERFLOW"}` as a control frame, kills the PTY, and closes the WebSocket with code `1011`.
- xterm.js's 50 MB internal write buffer is never reached because the client signals `pause` long before then.

### FR-408: Multiple terminal sessions and lifetime guarantees

- Multiple terminal sessions shall be creatable and switchable simultaneously. Each session is bound to an independent PTY process (= one WebSocket connection).
- On the client, a `TerminalManager` singleton (`src/lib/terminal/terminal-manager.ts`) owns xterm instances and WebSockets keyed by session ID. React components (`XTerminalAttach`) are thin attach points that only provide a DOM host.
- PTYs **shall not** be terminated by:
  - Collapsing or re-expanding the terminal panel (Ctrl+Cmd+J)
  - Switching to another terminal tab
  - Changing the global font size (the manager only mutates `term.options.fontSize`)
  - Next.js Fast Refresh / component remounts
- PTYs are terminated only by:
  - The user explicitly clicking the tab's close button
  - The shell exiting on its own (`exit`, etc.) — the server emits `{type:"exit", code}`
  - Forced termination from a `BUFFER_OVERFLOW` overflow
- **No auto-reconnect**: the terminal WebSocket does not automatically reconnect. An unexpected socket close transitions the session to `closed` and a `[connection to PTY lost]` marker line is written to the xterm buffer. Full policy in `FR-411`.
- **Restart action**: when a session is `closed` or `exited`, the user may click an inline Restart button on the tab or the panel chip to spawn a new PTY under the same session ID. The existing xterm scrollback is preserved and a `─── restarted at HH:MM:SS ───` separator line is inserted.

### FR-409: Terminal focus management

- Activating a terminal tab (by click or by creating a new tab) shall automatically focus xterm so the user can type without an extra click.
- Re-expanding the panel shall restore focus to the active tab.
- Tab labels shall show a visual indicator for the session status (`connecting` / `open` / `closed` / `exited`).

### FR-410: Terminal shell initialization and environment

- The server shall resolve, spawn, and environment-configure the shell via `server-handlers/terminal/shell-resolver.mjs` (`resolveShell()`, `shellFlags()`, `buildPtyEnv()`).
- **Shell resolution order**:
  1. `process.env.CLAUDEGUI_SHELL`, if set and the path exists.
  2. POSIX: `$SHELL` → `/bin/zsh` → `/bin/bash` → `/bin/sh`.
  3. Windows: `$COMSPEC` → `cmd.exe`. `CLAUDEGUI_SHELL=pwsh` etc. may be used to pick PowerShell.
- **Flag mapping** (basename, lowercased, `.exe` suffix stripped before matching):
  | Shell | Args |
  |---|---|
  | `zsh`, `bash`, `fish`, `sh`, `dash`, `ash`, `ksh` | `['-l', '-i']` (login + interactive) |
  | `pwsh`, `powershell` | `['-NoLogo']` |
  | `cmd` | `[]` |
- **Environment variables**: `TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=ClaudeGUI`, `TERM_PROGRAM_VERSION=<package.json version>`, `CLAUDEGUI_PTY=1`, `CLAUDEGUI_SHELL_PATH=<resolved shell>`. On POSIX, `LANG`/`LC_ALL` defaults to `en_US.UTF-8` only when neither is set (user value wins).
- Next.js server-only variables (`NODE_OPTIONS`, `ELECTRON_RUN_AS_NODE`, `NEXT_TELEMETRY_DISABLED`, `__NEXT_PRIVATE_*`, etc.) are defensively stripped.
- `CLAUDEGUI_EXTRA_PATH`, if set, is prepended to `PATH`.
- Because the shell runs as login + interactive, user dotfiles (`.zshrc`, `.zprofile`, `.bashrc`, `.bash_profile`) are sourced automatically. Consequently `claude`, `nvm`, `pyenv`, `brew`, user prompts, completions, and aliases all work inside the GUI terminal.

### FR-411: Terminal session durability policy

- The terminal WebSocket (`/ws/terminal`) **does not** auto-reconnect. An unexpected close transitions the session to `closed` and writes a notice line to the xterm buffer.
- This release does not introduce a server-side session registry or ID-based re-attach. For a local desktop app, the added complexity is not justified by the gain; the primary disconnect causes (server process death, HMR cycles) are not addressed by a session registry.
- Users recover sessions via one of two paths:
  - **Restart**: when the session is `closed`/`exited`, the inline Restart icon on the tab, the floating Restart chip in the panel body, or the `Cmd/Ctrl+Shift+R` shortcut spawns a new PTY under the same session ID. The xterm scrollback is preserved and a separator line is inserted.
  - **Close & New**: close the tab and open a new one. Session ID and scrollback are discarded.
- `ReconnectingWebSocket` continues to serve other channels (`/ws/claude`, `/ws/files`). The terminal channel uses `src/lib/terminal/terminal-socket.ts` (`TerminalSocket`).
- Related ADR: [ADR-019](./README.md).

### FR-412: Clipboard and paste UX

- Right-clicking the xterm host shall open a Radix `ContextMenu` with Copy, Paste, Select All, Clear, and Find… items.
- Copy is enabled only when there is an active selection (`term.hasSelection()`); it calls `navigator.clipboard.writeText` with the current selection.
- Paste reads from `navigator.clipboard.readText` and sends the result to the PTY via `TerminalManager.paste(id, text)`. If the paste exceeds **10 MB**, a confirmation prompt is shown.
- If a single input event exceeds **4 KB**, `sendInput` splits it into 4 KB slices and dispatches one `{type:'input'}` frame per slice, yielding between slices via `queueMicrotask`. This bounds JSON wrapping overhead and prevents head-of-line stalls for large pastes.
- xterm v5 automatically enables bracketed paste mode when a TTY application requests `\e[?2004h` (which zsh/bash/vim/emacs do by default). The client does not interfere with this behavior.

### FR-413: Terminal tab metadata

- **Rename**: double-clicking a tab label swaps it for an inline `<input>`. Enter commits, Escape cancels, blur commits. Sessions that have been renamed are marked `customName: true`.
- **CWD label**: the tab label appends the current PTY cwd basename separated by `·` (e.g. `Terminal 1 · src`). Basenames longer than 20 characters are ellipsized. The full path is exposed via the tab's `title` attribute.
- **OSC 7**: `TerminalManager` registers `term.parser.registerOscHandler(7, …)` to consume the shell's OSC 7 sequences (`\e]7;file://host/path\e\\`), updates the session's `cwd` field, and propagates the change through a listener. Malformed payloads (URL parse failure) are ignored.
- **Shell helper auto-injection**: 250 ms after the socket opens, the manager sends a one-time input frame containing an OSC 7 emitter snippet. The snippet detects `ZSH_VERSION` or `BASH_VERSION` and installs itself into either zsh's `precmd_functions` or bash's `PROMPT_COMMAND`. The command is prefixed with a leading space to keep it out of shell history for users with `HISTCONTROL=ignorespace`. Injection happens exactly once per session lifetime and is not repeated on Restart.
- **Project change banner**: when `useProjectStore.activeRoot` changes and at least one existing tab has a `cwd` different from the new root, a non-intrusive banner is rendered at the top of the terminal panel. The banner offers "Open new tab here" and "Dismiss" actions. It does not auto-inject `cd` (which could corrupt in-progress shell state). Dismissal applies only to the current active root; a subsequent change re-shows the banner.

### FR-414: Server-side terminal session registry with reconnect replay (ADR-019/020)

- The server manages every PTY lifecycle through the `TerminalSessionRegistry` singleton in `server-handlers/terminal/session-registry.mjs`. This preserves ADR-019 points (a), (d), (e) and supersedes (b) and (c). Rationale recorded in ADR-020.
- **Registry responsibilities**:
  - Register each PTY under a UUID and accumulate output into a 256 KB ring buffer.
  - Track attach / detach counts. Cancel the GC timer on attach; restart it (30-minute grace period) on detach.
  - `destroy(id)` kills the PTY and removes the record.
  - When the PTY exits on its own, record the exit code and auto-destroy 1 second later.
- **Protocol changes**:
  - Clients may append `?sessionId=<uuid>` to the `/ws/terminal` upgrade URL. If the session exists in the registry, the server attaches; otherwise it spawns a new PTY and registers it.
  - Immediately after attach, the server sends a `{type:"session", id, replay: boolean}` text frame. When `replay` is `true`, the next binary frame contains the ring-buffer snapshot taken at attach time.
  - On receiving `replay: true`, the client calls `term.clear()` before the replay binary frame arrives.
  - To destroy the server-side session immediately, the client sends a `{type:"close"}` control frame. Plain `ws.close` performs a detach only (the PTY stays alive).
- **Lifetime rules**:
  - `ws.close` (page reload, dropped network, HMR cycle) → detach, PTY preserved, 30-minute GC timer starts.
  - Reconnecting with the same `sessionId` within 30 minutes re-attaches, cancels GC, and replays the ring buffer.
  - After the 30-minute window, the PTY is killed and evicted. A subsequent client-side reconnect spawns a fresh PTY and the client surfaces `[previous session was evicted — started a fresh shell]`.
  - Closing the tab via the UI close button sends `{type:"close"}` → server destroys immediately.
  - When the PTY exits (`exit`), the server sends an `exit` frame and destroys the record 1 second later.
- **Relation to Restart**: The `FR-408` Restart action no longer tears down the server-side session. It simply opens a new socket with the same `sessionId`, replays the ring buffer, and continues. Restart is now the single path for recovering from any disconnection.
- **Durability bound**: the registry lives in process memory. All sessions are lost if the server process restarts. Persistence is future work.

### FR-415: File explorer context menu (Open terminal here / Reveal in Finder)

- Each node in the file explorer (`src/components/panels/file-explorer/file-tree.tsx`) shall open a Radix `ContextMenu` on right-click. Menu items:
  - **Open terminal here** — creates a new terminal session with the selected directory (or the parent directory when a file is selected) as its initial cwd. If the terminal panel is collapsed, it auto-expands. Server protocol: the WebSocket URL carries `?cwd=<path>`, and the server rejects paths outside the active project root via `resolveSafe`-equivalent validation.
  - **Reveal in Finder / File Explorer** — launches the platform-native file manager. macOS uses `open -R <abs>`, Windows uses `explorer <abs>` for directories and `explorer /select,<abs>` for files, Linux uses `xdg-open <dirname>`. Implementation: `POST /api/files/reveal`. Paths are validated via `resolveSafe`; missing paths return 404.
  - Rename / Copy path / Delete remain unchanged.

### FR-416: Background tab unread-output indicator

- A small dot indicator shall appear on inactive terminal tab labels whenever their PTY emits output. Activating the tab (`setActiveSession`) clears the indicator immediately.
- `TerminalManager` calls `emitActivity(inst)` on every `writePtyBytes` / `writePtyChunk`, and the store's `markUnread(id)` action sets `unread: true` only when the target session is not currently active.

### FR-417: File path auto-linking in terminal output

- File paths in PTY output (`src/foo.ts`, `./bar.py:42`, `/abs/baz.rs:10:4`, `C:\path\x.cs:7`) shall be rendered as clickable links via xterm's `registerLinkProvider`.
- Clicks invoke `TerminalManager.fileLinkHandler`, which `AppShell` wires to `useEditorStore.openFile(path, { line, col })`. Relative paths are resolved against the session's `cwd` (tracked via OSC 7). A project-root prefix is stripped so the resulting path is acceptable to `resolveSafe`.
- The Monaco editor watches `useEditorStore.pendingReveal` and, when set, calls `revealLineInCenter` + `setPosition` on the matching tab before clearing the reveal.

### FR-418: Split terminal view (2-pane horizontal)

- The user shall be able to split the terminal body into two horizontal panes via `Cmd/Ctrl+D`. Each pane owns its own active session.
- Store fields: `splitEnabled: boolean`, `primarySessionId: string | null`, `secondarySessionId: string | null`, `activePaneIndex: 0 | 1`. `activeSessionId` stays synced with whichever pane `activePaneIndex` points to.
- User interaction:
  - Focus switching: `Cmd/Ctrl+[` / `Cmd/Ctrl+]` or clicking a pane (mouseDown).
  - The active pane is visually indicated by a 1 px sky-500 ring.
  - Keyboard shortcuts (new tab, close, find, clear, restart, tab nav) all target the **active pane**'s session.
  - The tab bar remains singular; clicking a tab assigns that session to the currently active pane.
  - Toggling split on picks an existing alternate session for pane 1 or spawns a new one. Toggling split off leaves pane 1's session alive in the background tab list (it is never auto-closed).
- `closeSession` reshuffles pane assignments: the vacated pane falls back to another available session, and if both panes would point at the same session the secondary pane borrows a different one. If pane 1 ends up empty, split mode auto-collapses.

### FR-419: Terminal theme sync and font settings

- Terminal colors shall follow `useLayoutStore.theme` (`dark` / `light` / `high-contrast` / `retro-green`). `TerminalManager` declares `TERMINAL_THEMES` mapping each app theme to an xterm `ITheme`, and subscribes to the layout store on boot so `setTheme(theme)` propagates to every live instance.
- Terminal font family and ligature toggle are persisted in `useSettingsStore` as `terminalFontFamily` / `terminalFontLigatures` (defaults: `JetBrains Mono, Menlo, monospace` / `false`). On change the manager re-applies `term.options.fontFamily` to every instance and triggers `fit()`.
- A `terminalCopyOnSelect` setting (default `false`) mirrors the xterm selection to the system clipboard via `onSelectionChange` → `navigator.clipboard.writeText`.
- All three settings are exposed as Command Palette commands: "Terminal: Set Font Family…", "Terminal: Enable/Disable Font Ligatures", "Terminal: Enable/Disable Copy-on-Select".

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

### FR-504: Token-usage display

- The token usage (input/output) for each query shall be displayed.
- The `usage` field of the `result` message shall be used.
- The cumulative cost (`total_cost_usd`) is an estimate provided by the Agent
  SDK and shall **not** be surfaced in the session info bar. It is still
  accumulated internally in `SessionStats.costUsd` and `ClaudeState.totalCost`
  for non-display purposes such as the `max-budget` cap check (FR-508).
- **Session Info Bar**: A collapsible bar at the bottom of the Claude chat panel
  shall expose the stats of the currently active session.
  - Collapsed (default): a single line (height 24px) showing the model name,
    turn count, **context window usage** (used/limit and %), total token count,
    and last-updated relative time. The bar defaults to collapsed so it does
    not encroach on the editor.
  - Expanded: a tabular view showing session ID, model, `num_turns`,
    `duration_ms`, **context (used/limit and %)**, input/output/cache-read
    tokens, and the relative "updated" timestamp.
  - Values shall be sourced only from fields the Agent SDK actually emits
    (`system.init.model`, and `result.num_turns` / `duration_ms` / `usage.*` /
    `modelUsage.*`). The context window size is read from
    `result.modelUsage[model].contextWindow`, and the current-turn context
    usage is read from the same entry's `inputTokens + cacheReadInputTokens +
    cacheCreationInputTokens`. Values the SDK does not provide shall still
    not be hardcoded or estimated; until data arrives, every field shall be
    rendered as "-".
  - The context usage figure is a snapshot of the most recent `result` event
    (not a turn-accumulated total) and shall be tinted green below 50%, amber
    at 50% or above, and red at 80% or above.
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
  - Three buttons: **Deny**, **Allow Once**, **Always Allow**
- Each button shall behave distinctly:
  - **Deny**: returns `{ behavior: 'deny', message }` to the SDK. Claude abandons that tool use and seeks alternatives.
  - **Allow Once**: passes exactly one call through. No trace is written to the settings file.
  - **Always Allow**: writes a rule to `permissions.allow` in `.claude/settings.json` and then approves the current call. Subsequent calls to the same tool shall pass automatically without showing the modal.
- Physical user clicks are required. "Allow Once" shall not be promoted to auto-approval even within the same session.
- In `permissionMode: 'default'`, the Agent SDK may auto-approve safe actions (reads, simple Bash commands). In that case `canUseTool` is not called, and the tool use is recorded only as a tool message in the chat panel.
- Closing the modal (Escape/backdrop) or terminating the session shall resolve any pending request as Deny.

### FR-506: Auto-approval rules (persistent mode)

- The server shall consult `permissions.allow` / `permissions.deny` in `.claude/settings.json` to auto-approve or auto-deny tool invocations.
- Matching shall be evaluated by re-reading the file on every `canUseTool` call, so rules added via "Always Allow" take effect starting with the very next call.
- Rule grammar:
  - Plain tool name: `Write`, `Edit`, `Read`, etc. — matches every invocation of that tool.
  - Bash pattern: `Bash(<prefix>:*)` — matches when the command begins with `<prefix>`. Without `:*` an exact match is required.
- For Bash calls, "Always Allow" shall synthesize a rule of the form `Bash(<firstToken>:*)` based on the first whitespace-delimited token of the command (e.g. `npm test ...` → `Bash(npm:*)`).
- When auto-approval or auto-denial fires, the server shall emit an `auto_decision` WebSocket event and the UI shall record it as a system message in the chat panel.
- Users shall be able to view, add, and remove persisted `allow` / `deny` rules through `PermissionRulesModal`.
- For calls whose risk is assessed as `danger`, the "Always Allow" button shall be disabled to prevent dangerous commands from being inadvertently added to the persistent allow list.

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

### FR-511: Prompt @ file/directory references

- Typing `@` in the Claude prompt input shall open an autocomplete popover for referencing files and directories inside the active project (parity with the Claude Code CLI built-in feature).
- Candidates are collected by recursively calling `GET /api/files` from the active project root (`useProjectStore.activeRoot`) up to a depth of 3, and include both files and directories. Hidden / protected files (`.env`, `.git`, `.claude`, …) follow the default filtering policy of `/api/files`.
- An overlay (`MentionPopover`) above the textarea shows up to 20 candidates. Ranking: exact match > full-path prefix > basename prefix > substring > subsequence.
- Trigger rule: a literal `@` is treated as a mention only when it is at the start of the text or preceded by whitespace (so email-like strings such as `user@domain` are not treated as mentions). Any whitespace between `@` and the cursor closes the mention.
- Keyboard: `ArrowUp` / `ArrowDown` move the selection, `Enter` / `Tab` accept, `Escape` closes. While the popover is open, `Enter` accepts the selection instead of submitting the message.
- On accept, the input's `@<query>` token is replaced with `@<project-relative-path>`; directories get a trailing `/`. A space is auto-inserted after the token if none exists, and the cursor moves after the insertion.
- When the prompt is sent, `@` references are passed verbatim to the Claude Agent SDK via `sendQuery(prompt)`. Reference resolution / file-content expansion is delegated to the SDK / CLI's standard grammar; the GUI performs no client-side preprocessing.
- Implementation: `src/lib/fs/list-project-files.ts`, `src/components/panels/claude/use-file-mentions.ts`, `src/components/panels/claude/mention-popover.tsx`, `src/components/panels/claude/claude-chat-panel.tsx`.

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
- **Editor handoff rule**: when an HTML file path is detected from a `Write`/`Edit` `tool_use`, it is stored in `useLivePreviewStore.generatedFilePath`. When the user opens that file in an editor tab, the live preview must switch its source from the frozen buffer to the editor tab's `content` — even after stream finalization — and re-render the `iframe srcdoc` on every keystroke (debounced by 150 ms). The status label switches to `Live · Editor` in this state. Code-fence-only generations (no file path) continue to render from the buffer as before.
- **Partial-edit preservation rule**: when an `Edit`/`MultiEdit` `tool_use` targets a `.html` file, the `new_string` snippet must not be treated as the full document. Instead, the `HtmlStreamExtractor` shall apply the `old_string → new_string` replacement (honoring the `replace_all` flag, and iterating the `edits[]` array in order for `MultiEdit`) against the last known full HTML — obtained from a prior `Write`, a completed code fence, or an explicit `seedBaseline()` call — and publish the patched document. This ensures that editing one page of a five-page HTML preserves the rendering of the other pages.
- **Live-preview buffer persistence**: starting a new Claude query must not wipe `useLivePreviewStore.buffer` or `generatedFilePath`. Follow-up `Edit`/`MultiEdit` operations rely on the previous render as their baseline; the next incoming chunk replaces the buffer via `appendChunk` as soon as it arrives.
- **Baseline disk fallback**: when an `Edit`/`MultiEdit` arrives and no in-memory baseline exists (e.g. the very first interaction in a fresh session is an edit), the `HtmlStreamExtractor` emits `onNeedBaseline(filePath, apply)`. `useClaudeStore` asynchronously reads the file via `/api/files/read` and calls `apply(content)`, at which point the extractor applies the queued edits on top. If the read fails, the preview is left unchanged.
- Implementation: `src/lib/claude/html-stream-extractor.ts` (`onWritePath`, `onNeedBaseline`, `seedBaseline`), `src/stores/use-live-preview-store.ts` (buffer-preserving `startStream`), `src/stores/use-claude-store.ts` (`onNeedBaseline` → `/api/files/read` fallback, extractor seeding), `src/components/panels/preview/live-html-preview.tsx` (editor-store subscription).

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

### FR-806: Terminal keyboard shortcuts

The following shortcuts are active **only when the terminal panel has focus** (except `Cmd+Shift+Enter`, which is active when the editor has focus). Focus scope is determined by `src/hooks/use-keyboard-shortcut.ts::isFocusInsideTerminal()`, which walks up from `document.activeElement` looking for the `data-terminal-panel="true"` attribute.

| Key (macOS / other) | Action |
|---|---|
| `Cmd+T` / `Ctrl+T` | New terminal tab |
| `Cmd+W` / `Ctrl+W` | Close active tab |
| `Cmd+1..9` / `Ctrl+1..9` | Activate tab N |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Cmd+F` / `Ctrl+F` | Toggle search overlay (`FR-405`) |
| `Cmd+K` / `Ctrl+K` | Clear active terminal buffer (`term.clear()`) |
| `Cmd+Shift+R` / `Ctrl+Shift+R` | Restart active session (`FR-408`/`FR-411`/`FR-414`) |
| `Cmd+D` / `Ctrl+D` | Toggle terminal split view (`FR-418`) |
| `Cmd+]` / `Ctrl+]` · `Cmd+[` / `Ctrl+[` | Cycle active pane when split mode is on |
| `Cmd+Shift+Enter` / `Ctrl+Shift+Enter` | **Run editor selection (or current line) in the active terminal**; focus stays in the editor |

**Implementation notes**:

- On boot, `TerminalManager.attachCustomKeyEventHandler` vetoes the reserved combinations so xterm never writes them to the PTY.
- The global shortcut handler (`src/hooks/use-global-shortcuts.ts`) listens for the same combinations and dispatches `useTerminalStore` actions.
- `Cmd+K` arbitration: when focus is inside the terminal, the Command Palette (`FR-801`) `Cmd+K` handler becomes a no-op and the buffer-clear action takes over. Outside the terminal, the palette still opens as before.

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

---

## 3.10 Generated Content Gallery (FR-1000)

### FR-1001: Automatic artifact extraction

- Whenever the system receives a Claude assistant message, it shall parse the message body and automatically extract the following kinds of "artifacts" (generated content):
  - Fenced code blocks in any language: HTML, SVG, Markdown, TypeScript/JavaScript, Python, Go, Rust, Shell, CSS, JSON, YAML, and so on.
  - Stand-alone `<!doctype html> … </html>` documents that appear outside of any fence.
  - Stand-alone `<svg …> … </svg>` elements that appear outside of any fence.
- Each artifact shall have a stable id of the form `{messageId}:{index}`.
- On session restore the same ids are reused so duplicates do not accumulate.
- Blocks shorter than 24 characters are treated as noise and dropped.

### FR-1002: Auto-popup behaviour

- If one or more new artifacts are extracted during a single Claude turn, the Generated Content gallery modal shall open automatically when the turn ends (the `result` event).
- If the user disables "Auto-open on new content" in the gallery toolbar, the modal shall not open on its own.
- Artifact extraction performed while loading session history is a "silent extract" that must not trigger the auto-popup.

### FR-1003: Persistent storage (localStorage)

- Extracted artifacts shall be persisted in the browser's `localStorage` and the gallery shall be restored intact across page reloads.
- Storage key: `claudegui-artifacts` (zustand `persist` middleware).
- The store is capped at 200 artifacts; when the cap is exceeded, the oldest entries are evicted first.
- The `autoOpen` preference is persisted under the same key.

### FR-1004: Copy and export

- Every artifact in the gallery supports two actions:
  - **Copy** — write the raw text to the clipboard via `navigator.clipboard.writeText`.
  - **Export** — a dropdown menu offers the applicable formats for the artifact's `kind`:
    - **Source** — download using the language-appropriate extension (`.ts`, `.py`, `.html`, `.svg`, `.md`, etc.).
    - **HTML (.html)** — download the markdown/code/SVG artifact as a stand-alone `<!doctype html>` document.
    - **PDF** — open a print-ready popup window and call `window.print()`, letting the OS "Save as PDF" dialog produce the file.
    - **Word (.doc)** — download MS Word-compatible HTML with the `application/msword` MIME type (opens in Word and Pages).
    - **SVG → PNG** — rasterise via `<canvas>` and download a PNG.
    - **Plain text (.txt)** — fallback for generic code and text artifacts.
- The Export menu is built dynamically by `availableExports(artifact)` based on the artifact's kind.

### FR-1005: Gallery UI

- The gallery is a modal dialog laid out as a left-hand list and a right-hand detail preview.
- Each list row shows a kind badge (HTML/SVG/Markdown/Code/Text), the artifact title, the language, and a relative timestamp.
- The detail area exposes a **Preview / Source** toggle. Preview is the default, and per-kind rendering is as follows:
  - **HTML**: `<iframe sandbox="allow-scripts">` with `srcDoc` (no `allow-same-origin`, matching the main preview-panel policy).
  - **SVG**: rendered via `data:image/svg+xml;charset=utf-8,…` in an `<img>` so embedded scripts and event handlers cannot execute.
  - **Markdown**: reuses the existing `MarkdownPreview` component (`react-markdown` + `remark-gfm` + `rehype-sanitize`).
  - **Code/Text**: Preview is not offered; the view falls back to Source mode.
- Copy, Export, and Delete actions remain available, along with the top-bar `Auto-open on new content` checkbox and `Clear all` button.
- Accessibility: the modal is built on Radix Dialog and closes on ESC.

### FR-1006: Entry point, badge, and shortcut

- A `FileStack` icon button in the Claude chat panel header shall let the user open the gallery manually.
- A small badge on that button shows the current artifact count (capped at `99+`).
- The global shortcut **`Cmd/Ctrl + Shift + A`** toggles the gallery (`src/hooks/use-global-shortcuts.ts`).

### FR-1007: Implementation

- `src/lib/claude/artifact-extractor.ts` — regex-based artifact extractor.
- `src/lib/claude/artifact-export.ts` — copy, download, print-to-PDF, Word, and PNG export helpers.
- `src/stores/use-artifact-store.ts` — zustand store (with the `persist` middleware).
- `src/components/modals/artifacts-modal.tsx` — the gallery dialog (Preview/Source toggle with safe renderers).
- `src/components/panels/claude/claude-chat-panel.tsx` — trigger button and badge.
- `src/hooks/use-global-shortcuts.ts` — `Cmd/Ctrl + Shift + A` toggle shortcut.
- `src/stores/use-claude-store.ts` — calls the extractor when assistant messages arrive and when sessions are loaded; flushes the auto-popup on the `result` event.
