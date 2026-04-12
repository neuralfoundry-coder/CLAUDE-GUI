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

- **All five panels** shall be collapsible and expandable.
  - File Explorer, Editor, Terminal, Claude Chat, Preview
- When collapsed, panels may display icons only (`collapsedSize: 4px`) or be fully hidden (`collapsedSize: 0`).
- The editor panel header shall expose a `Code2` icon toggle button, and the Claude chat panel header shall expose a `MessageSquare` icon toggle button to control collapse/expand of each panel.
- Corresponding keyboard shortcuts:
  - `Ctrl+Cmd+B` / `Ctrl+Alt+B` — toggle file explorer
  - `Ctrl+Cmd+E` / `Ctrl+Alt+E` — toggle editor
  - `Ctrl+Cmd+J` / `Ctrl+Alt+J` — toggle terminal
  - `Ctrl+Cmd+K` / `Ctrl+Alt+K` — toggle Claude chat
  - `Ctrl+Cmd+P` / `Ctrl+Alt+P` — toggle preview

### FR-104: Layout state persistence

- Panel sizes and collapse states shall be automatically persisted to `localStorage`.
- The `autoSaveId` attribute of `react-resizable-panels` shall be used.
- On browser reload, the last layout state shall be restored.

### FR-105: Nested panel groups

- The center area shall be split vertically into editor (top) and terminal (bottom).
- Nested `PanelGroup` structures shall be supported.

### FR-106: Double-click resize handle reset

- Double-clicking a `PanelResizeHandle` shall reset the adjacent panels to their default sizes.
- This allows users to quickly restore the layout without manual dragging.

### FR-107: Responsive mobile layout

- When the viewport width is **below 1280px**, the app shall switch to a single-panel tab mode.
- A bottom tab bar shall be provided with the following five tabs for panel switching:
  - Files, Editor, Terminal, Claude, Preview
- When a tab is selected, only the corresponding panel shall be displayed full-screen; all others shall be hidden.
- When the viewport returns to 1280px or above, the previous four-panel (or last saved) layout shall be automatically restored.

---

## 3.2 File Explorer (FR-200)

### FR-201: Directory tree rendering

- The project directory shall be displayed as a recursive tree.
- Virtualized rendering shall be performed based on `react-arborist` v3.4.
- 60 FPS scrolling shall be maintained even with thousands of files.

### FR-202: File/folder CRUD

- Creation, rename (F2), and deletion of files and folders shall be supported.
- **Renaming uses inline editing** (react-arborist `tree.edit()`). `Enter` commits, `Esc` cancels, and blurring the input auto-commits. Empty strings, `.`, `..`, path separators (`/`, `\`), and `\0` are rejected.
- **New file / new folder uses the create-then-inline-rename pattern**, matching macOS Finder. A placeholder `untitled.txt` / `untitled folder` (disambiguated with ` 2`, ` 3`, … if it already exists) is created immediately, after which the new node automatically enters rename mode.
- **Deletion confirmation uses a shadcn `<Dialog>`-based `DeleteConfirmDialog`** for both single and multi-selection. For multi-selection, the affected paths are listed inside the modal. Folder deletion is recursive by default (`fs.rm({ recursive: true })`); the API opts in via `DELETE /api/files?path=…&recursive=1`.
- Bulk deletion processes the selection sequentially; if some items fail, the remainder are still attempted and the failure list is reported to the user at the end.
- Implementation: `src/components/panels/file-explorer/file-tree.tsx` (inline input renderer), `src/components/panels/file-explorer/use-file-actions.ts` (`deletePaths`), `src/components/panels/file-explorer/delete-confirm-dialog.tsx`, `src/lib/fs/file-operations.ts` (`deleteEntry({ recursive })`).

### FR-203: Intra-tree drag and drop (move/copy)

- Nodes within the tree shall be draggable to another directory to move or copy them.
- The default drag is a **move** (via `filesApi.rename`, an in-place rename within the same filesystem). Holding the `Alt`/`Option` modifier turns the drag into a **copy** (via `filesApi.copy`). The modifier key is captured from native `dragstart`/`dragover` events and forwarded to react-arborist's `onMove` callback through a ref.
- Moving a node into itself or any of its descendants is rejected with a user-visible reason. Copy mode allows duplicating into the same directory (an automatic ` (1)` suffix is appended).
- Multi-selected drags are processed in bulk. Partial failures are tolerated: successful items are applied and the failure list is aggregated for the user.
- This rule applies only to **intra-tree node drags**. OS file-explorer drops (`FR-208`) are routed through a separate path keyed on `e.dataTransfer.types` containing `'Files'`, so the two flows do not collide.
- Implementation: `src/components/panels/file-explorer/file-tree.tsx` (`onMove`, `dragAltKeyRef`), `src/components/panels/file-explorer/file-explorer-panel.tsx` (`onMove` handler), `src/app/api/files/copy/route.ts`.

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

### FR-206: Context menu (hoisted single instance)

- Right-clicking a file or folder shall open a context menu.
- **The menu is rendered as a single instance hoisted to the panel root** (`src/components/panels/file-explorer/file-context-menu.tsx`). On right-click the node renderer dispatches `useFileContextMenuStore.openAtNode({ clientX, clientY }, target, selectionPaths)`, and the menu component moves a `position: fixed` invisible anchor to those coordinates and opens a Radix DropdownMenu against it. As a result, react-arborist's virtualized list reconciliation and per-node hover re-renders cannot affect menu state.
- **The menu dismisses only on (a) `Esc`, (b) clicking outside the menu, or (c) right-clicking another node (which moves the anchor)**. Plain mouse movement does not dismiss the menu (matching Radix DropdownMenu's default behaviour).
- **Menu items** — node scope:
  - `Open` (file), `Open as project root` (directory)
  - `Open terminal here`, `Open in system terminal`, `Reveal in Finder/File Explorer`
  - `Cut` (Cmd/Ctrl+X), `Copy` (Cmd/Ctrl+C), `Paste` (Cmd/Ctrl+V — disabled when clipboard is empty), `Duplicate` (Cmd/Ctrl+D)
  - `Copy path`
  - For directories only: `New file…`, `New folder…`
  - `Rename` (F2 — enters inline edit mode)
  - `Delete` (Del — opens `DeleteConfirmDialog`)
- **Menu items** — empty-area scope (right-clicking the empty space of the tree): `New file…`, `New folder…`, `Paste`, `Refresh`.
- When a multi-selection exists, right-clicking forwards every selected path as `selectionPaths`, so `Cut`/`Copy`/`Delete` operate on the entire selection. If the right-clicked node is not part of the existing selection, the selection is replaced with that single node (matching Finder/Explorer behaviour).

### FR-207: Virtualized rendering

- Only nodes visible on screen shall be rendered to the DOM, to support large projects.
- `react-arborist`'s built-in virtualization shall be used.

### FR-208: Local file drag-and-drop / paste upload

- The user shall be able to **drag and drop** files from the local OS file manager (macOS Finder, Windows Explorer, etc.) onto the web file-explorer panel to copy them into the current project.
- The user shall be able to **paste** files/images from the clipboard into the web file-explorer panel (`Cmd+V` / `Ctrl+V`) to copy them into the project root. When the panel has focus, `clipboardData.files` from the `onPaste` event is consumed.
- While dragging, the panel shall render a `ring-2 ring-primary` border together with a "Drop files to upload to project root" overlay to provide visual feedback. Only drags whose `e.dataTransfer.types` include `'Files'` are accepted, so the handler is distinguished from react-arborist's internal node drags.
- **Folder targeting**: When files are dropped inside the file tree area, the target folder is determined from the node under the cursor. Dropping on a directory node uploads into that directory; dropping on a file node uploads into the file's parent directory; dropping on empty space uploads to the project root. Dropping outside the tree area (e.g. the panel header) also uploads to the project root. This behavior is implemented via a **capture-phase** `drop` event listener on the tree container that intercepts external file drops before react-dnd's HTML5Backend can consume the event.
- Uploads use the `POST /api/files/upload` endpoint (see `04-api-design.md`). The payload is `multipart/form-data` with a `destDir` field (path relative to the project root, empty meaning root) and one or more repeated `files` fields.
- The server shall enforce the following:
  - Use `resolveSafe(destDir)` to restrict the destination directory to the project-root sandbox.
  - Normalize each filename with `path.basename` and reject names equal to `.`, `..`, or containing `/`, `\`, or `\0`.
  - Reject individual files larger than `MAX_BINARY_SIZE` (50 MB) and reject any request whose total size exceeds 200 MB with `413 Payload Too Large`.
  - If a filename already exists, do not overwrite — disambiguate by appending ` (1)`, ` (2)`, etc.
- On success, the client calls `refreshRoot()` to refresh the tree immediately. The `/ws/files` watcher also emits a change event, but the manual refresh avoids waiting on the `@parcel/watcher` event batch.
- On failure, the header status label renders `upload failed: <message>` highlighted with `text-destructive`.
- Implementation: `src/app/api/files/upload/route.ts`, `src/lib/api-client.ts` (`filesApi.upload`), `src/components/panels/file-explorer/file-explorer-panel.tsx` (drop/paste handlers, overlay), `src/components/panels/file-explorer/file-tree.tsx` (capture-phase external file drop handler, `onExternalFileDrop` prop).

### FR-209: Explorer root navigation (up / down re-rooting)

- The file explorer must be able to **move the active project root to a parent directory or to any descendant directory**. The newly chosen directory becomes the active root and is immediately reflected across the entire process (file API sandbox, new terminal session cwd, Claude query cwd, `@parcel/watcher` subscription target).
- **UI**:
  - An **↑ Up button** (`lucide-react`'s `ArrowUp`) in the panel header calls `useProjectStore.openParent()`, which sets `path.dirname(activeRoot)` as the new root. If the parent would become the filesystem root (`/` or `C:\`), the backend rejects with `4403` and the button is disabled.
  - A **breadcrumb bar** below the header renders each path segment of the current root as a clickable button. The trailing segment highlights the current location; clicking any other segment re-roots to that ancestor.
  - The right-click **context menu on directory nodes gains a top-level "Open as project root"** item (not shown on file nodes). Selecting it calls `openProject()` with the directory's absolute path.
- **Constraints**:
  - The filesystem root (`/` or Windows drive root) is still rejected (see `FR-908`).
  - `$HOME` is now allowed as an explicit user choice (the previous `4403` ban is removed). This supports the legitimate use case of editing dotfile/script projects under `~`. The dotfile deny list in `resolveSafe` (`.env`, `.git`, `.ssh`, `.claude`, `.aws`, `.npmrc`, `id_rsa`, `id_ed25519`, `credentials`, …) still blocks access to sensitive files.
- **State transitions**: Changing the root resets existing editor tabs and preview selection (FR-908 behavior) and reloads the file tree against the new root. Running terminal sessions are preserved, but newly created sessions start in the new root.
- Implementation: `src/components/panels/file-explorer/file-explorer-panel.tsx` (Up button, breadcrumb), `src/components/panels/file-explorer/file-tree.tsx` (context menu item), `src/stores/use-project-store.ts` (`openParent()`, `parentDirectory()`).

### FR-210: Multi-selection

- The file explorer shall support selecting multiple nodes simultaneously.
- Mouse: single click = replace selection, `Cmd`/`Ctrl`+click = toggle, `Shift`+click = range, click on empty area = clear. All handled by react-arborist's built-in selection model.
- Keyboard: `↑`/`↓` move focus, `Cmd`/`Ctrl`+`A` selects all visible nodes, `Esc` clears the selection.
- The current selection is the single source of truth for the context menu, keyboard shortcuts, drag-move, and bulk delete actions.
- Implementation: `src/components/panels/file-explorer/file-tree.tsx` (`onSelect` → `onSelectionChange`), `src/components/panels/file-explorer/file-explorer-panel.tsx` (`selection`/`selectionRef`).

### FR-211: In-app file clipboard (Cut/Copy/Paste/Duplicate)

- The file explorer maintains its own in-app clipboard, separate from the OS clipboard (`useFileClipboardStore` — `{ paths, mode: 'copy' | 'cut' | null }`).
- **Copy** (`Cmd`/`Ctrl`+`C`): loads the current selection into the clipboard with `mode='copy'`. No visual indicator (matches Finder).
- **Cut** (`Cmd`/`Ctrl`+`X`): loads the selection with `mode='cut'`. Cut nodes are rendered as `italic + opacity-50` in the tree.
- **Paste** (`Cmd`/`Ctrl`+`V`): applies the clipboard contents to the currently focused directory (or the active root if none). `copy` mode goes through `filesApi.copy`; `cut` mode goes through `filesApi.rename` (move). Naming conflicts are resolved with ` (1)`, ` (2)` suffixes (matching the upload rule in FR-208).
- **Duplicate** (`Cmd`/`Ctrl`+`D`): immediately duplicates the single-selected node into the same directory with a ` (1)` suffix.
- After a successful cut+paste, the clipboard is cleared automatically. On partial failure, the clipboard is preserved so the user can retry elsewhere.
- Moving or copying into self/descendant is rejected, and failures are surfaced to the user.
- Implementation: `src/stores/use-file-clipboard-store.ts`, `src/components/panels/file-explorer/use-file-actions.ts` (`copyToClipboard`, `cutToClipboard`, `paste`, `duplicate`), `src/app/api/files/copy/route.ts`, `src/lib/api-client.ts` (`filesApi.copy`).

### FR-212: File-explorer keyboard shortcuts

- The following shortcuts are active when focus is inside the file-explorer panel (`isFocusInsideFileExplorer()` — based on the `data-file-explorer-panel="true"` container). They never fire when another panel has focus.

| Key | Action |
|---|---|
| `↑` / `↓` / `←` / `→` / `Home` / `End` | Move focus among tree nodes (built-in react-arborist) |
| `Enter` / `Space` | Open file / toggle folder |
| `F2` | Enter inline rename |
| `Del` / `Backspace` | Delete the selection through `DeleteConfirmDialog` |
| `Cmd`/`Ctrl` + `A` | Select all visible nodes |
| `Cmd`/`Ctrl` + `C` | Copy the selection |
| `Cmd`/`Ctrl` + `X` | Cut the selection |
| `Cmd`/`Ctrl` + `V` | Paste into the current directory |
| `Cmd`/`Ctrl` + `D` | Duplicate single selection |
| `Cmd`/`Ctrl` + `N` | Create new file + enter inline rename |
| `Cmd`/`Ctrl` + `Shift` + `N` | Create new folder + enter inline rename |
| `Esc` | Clear selection / close context menu |

- All shortcuts reuse the existing `useKeyboardShortcut`/`hasPrimaryModifier` infrastructure and automatically map the platform-specific modifier (`Cmd` on macOS, `Ctrl` elsewhere).
- Implementation: `src/components/panels/file-explorer/use-file-keyboard.ts`, `src/hooks/use-keyboard-shortcut.ts` (reused).

---

## 3.3 Code Editor (FR-300)

### FR-301: Monaco Editor integration

- Monaco Editor shall be integrated via the `@monaco-editor/react` package.
- The CDN loader shall be used to optimize bundle size.

### FR-302: Multi-tab support

- Multiple files shall be openable simultaneously as tabs.
- Each tab shall maintain an independent Monaco model.
- Closing tabs and reordering tabs via drag shall be supported.
- A right-click context menu on tabs shall be supported:
  - **Close** — close the tab
  - **Close Others** — close all tabs except the selected one
  - **Close to the Right** — close all tabs to the right of the selected tab
  - **Close All** — close all tabs

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

- External file changes detected by `@parcel/watcher` shall be reflected in the editor in real time.
- Change events are received via the WebSocket `/ws/files` channel.
- Content is updated while preserving the user's cursor position.
- If the editor has unsaved changes, a conflict notification shall be displayed.

### FR-309: AI inline code completion

- Inline code completion (ghost text) powered by Claude shall be supported.
- After the user stops typing, a completion suggestion shall appear after a configurable delay (default 500ms).
- The Tab key accepts the suggestion; the Esc key dismisses it.
- The `completion_request`/`completion_response` messages on the WebSocket `/ws/claude` channel are used.
- Code context around the cursor (100 lines before, 30 lines after) shall be sent for accurate completions.
- Completion can be enabled/disabled in settings.

### FR-310: Editor panel header and settings

- An "Editor" header bar shall be displayed at the top of the editor panel (consistent with other panels).
- The right side of the header shall display:
  - Language label for the current file
  - Cursor position (Ln, Col)
  - AI completion loading indicator
  - Settings dropdown (gear icon)
- The settings dropdown shall provide the following options:
  - Tab size (2/4/8)
  - Spaces/tabs toggle
  - Word wrap on/off
  - Minimap on/off
  - Sticky scroll on/off
  - Bracket colors on/off
  - Whitespace rendering (none/boundary/all)
  - AI completion on/off

### FR-311: Advanced editing features

- The following Monaco Editor advanced features shall be enabled by default:
  - Auto-closing brackets/quotes
  - Bracket pair colorization and guide lines
  - Code folding (indentation-based)
  - Find/Replace (Cmd+F / Cmd+H)
  - Multi-cursor editing (Alt+click)
  - Smooth scrolling and cursor animation
  - Sticky scroll (current scope display)
  - Linked editing

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
- **Visibility requirement (WCAG AA)**: every `foreground` and ANSI-16 color in `TERMINAL_THEMES` shall meet a **contrast ratio ≥ 4.5:1** against the theme's `background`. The only exceptions are the `black`/`brightBlack` slots that by xterm convention map to the app background tone (and only when they do in fact satisfy WCAG against that background) and the `cursor`/`selectionBackground` entries that render as inverted overlays. This is enforced automatically by `tests/unit/terminal-themes-contrast.test.ts`.
- The palette is defined in a single source `src/lib/terminal/terminal-themes.ts` and imported by `TerminalManager`, which propagates it to every instance via `setTheme(theme)`.

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

- Terminal colors shall follow `useLayoutStore.theme` (`dark` / `light` / `high-contrast` / `retro-green`). `TerminalManager` imports `TERMINAL_THEMES` from `src/lib/terminal/terminal-themes.ts` and subscribes to the layout store on boot so `setTheme(theme)` propagates to every live instance.
- **Host background sync**: the xterm host `<div>` must not flash a wrong color during theme toggles, tab switches, or panel mounts before the WebGL canvas paints. To enforce this, `src/app/globals.css` declares `--terminal-bg` / `--terminal-fg` CSS variables on each of `:root`, `.dark`, `.high-contrast`, `.retro-green`, and `x-terminal.tsx` consumes them via `style={{ background: 'var(--terminal-bg)' }}`. The CSS variable values MUST match `TERMINAL_THEMES[theme].background`/`foreground` exactly; drift is detected by `tests/unit/terminal-themes-contrast.test.ts`.
- Terminal font family and ligature toggle are persisted in `useSettingsStore` as `terminalFontFamily` / `terminalFontLigatures` (defaults: `JetBrains Mono, Menlo, monospace` / `false`). On change the manager re-applies `term.options.fontFamily` to every instance and triggers `fit()`.
- A `terminalCopyOnSelect` setting (default `false`) mirrors the xterm selection to the system clipboard via `onSelectionChange` → `navigator.clipboard.writeText`.
- All three settings are exposed as Command Palette commands: "Terminal: Set Font Family…", "Terminal: Enable/Disable Font Ligatures", "Terminal: Enable/Disable Copy-on-Select".

### FR-420: OS terminal bypass (Open in system terminal)

- Users shall be able to open the **current tab's cwd** (or the active project root if none) in the OS default terminal app via `Cmd/Ctrl+Shift+O`, the `ExternalLink` icon button in the terminal tab strip, the "Open in system terminal" entry in the xterm context menu, or the "Open in system terminal" entry in the file-explorer directory context menu. The internal xterm session is not affected.
- Endpoint: `POST /api/terminal/open-native`, body `{ cwd?: string }`. When omitted, `getActiveRoot()` is used. `cwd` is normalized against the project root via `resolveSafe`; if it points at a file, `path.dirname` is applied automatically.
- Platform launcher selection is delegated to the pure function `resolveLauncher({platform, cwd, env, exists})` in `src/app/api/terminal/open-native/launchers.ts`:
  - **darwin**: `CLAUDEGUI_EXTERNAL_TERMINAL` → `open -na <value> <cwd>`; otherwise iTerm (when `/Applications/iTerm.app` exists) else Terminal.app.
  - **win32**: `CLAUDEGUI_EXTERNAL_TERMINAL` → `<value> -d <cwd>`; otherwise Windows Terminal when `%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe` exists; otherwise `cmd.exe /c start "" cmd.exe /K cd /d <cwd>`.
  - **linux/BSD**: `CLAUDEGUI_EXTERNAL_TERMINAL` → `$TERMINAL` → `x-terminal-emulator` → `gnome-terminal` → `konsole` → `xfce4-terminal` → `tilix` → `alacritty` → `kitty` → `wezterm` → `xterm`, picking the first binary on PATH. The cwd flag differs per emulator (`--working-directory`, `-d`, `start --cwd`, …) and is captured in a per-binary table. `xterm` falls back to `-e 'cd <escaped> && exec $SHELL'` since it has no cwd flag.
- `CLAUDEGUI_EXTERNAL_TERMINAL` overrides the OS default. On macOS the value is passed to `open -a`; on Linux it is looked up on PATH as a binary name; on Windows it is treated as a full executable path.
- Error handling: if no terminal is installed or the override cannot be resolved, `resolveLauncher` raises `NoLauncherError` → HTTP 501 (`code: 4501`). `spawn` failures (e.g. ENOENT) are raced against an `error` event for a 100 ms window and reported as HTTP 500 (`code: 5500`) with a reason string. `resolveSafe` violations → 403 (`code: 4403`). A missing cwd → 404 (`code: 4404`).
- Security: the child process is launched with `spawn(..., { detached: true, stdio: 'ignore' })` and `child.unref()` so the server never consumes its stdio. The `/ws/terminal` + `127.0.0.1` bind invariant holds; `0.0.0.0` exposure remains prohibited.

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
- **Message type system (v0.6)**: Each `ChatMessage` is refined with a `kind: MessageKind` field.
  - `MessageKind = 'text' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'auto_decision'`
  - `tool_use` messages store the full `toolInput` and are displayed as collapsible cards (no 300-char truncation).
  - `isStreaming?: boolean` identifies messages currently receiving chunks.
- **Progressive text streaming (v0.6)**: Consecutive `assistant` events within the same turn append to the existing message's `content` instead of creating a new one. On `result`, `isStreaming` is set to `false`.
- **Message filter (v0.6)**: `messageFilter: Set<MessageKind>` allows toggling visible types. A filter bar below the header displays chips per kind with count badges. User messages are excluded from filtering (always visible).
- **Message renderers (v0.6)**: Dedicated renderers per `kind`:
  - `text`: react-markdown + streaming cursor animation
  - `tool_use`: collapsible card (tool name header + expandable JSON body)
  - `auto_decision`: inline pill/badge (allow=green, deny=red)
  - `error`: red background + error icon
  - `system`: centered divider
- **Typing indicator (v0.6)**: When `isStreaming` is true and no assistant message is actively streaming, a "Claude is thinking..." pulse indicator is shown.
- Implementation: `src/stores/use-claude-store.ts` (`MessageKind`, `ChatMessage` extension, `messageFilter`, `toggleFilter`, progressive append), `src/components/panels/claude/chat-message-item.tsx`, `src/components/panels/claude/chat-filter-bar.tsx`, `src/components/panels/claude/claude-chat-panel.tsx`.

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

### FR-512: Model Selection

- Users shall be able to select the Claude model via a dropdown in the Claude chat panel header.
- Options: `Auto` (default, SDK default model) and supported models (`claude-opus-4-6` (1M ctx), `claude-sonnet-4-6` (200K ctx), `claude-haiku-4-5-20251001` (200K ctx)).
- Each model item displays the model name, description (e.g. "Most capable for complex work"), context window size, and input price tier.
- The selected model is stored in `useSettingsStore.selectedModel` and persisted via `localStorage`.
- When sending a query, the selected model ID is included in `ClaudeQueryMessage.options.model` and forwarded to the server.
- Implementation: `src/lib/claude/model-specs.ts`, `src/components/panels/claude/model-selector.tsx`, `src/stores/use-settings-store.ts`, `src/lib/websocket/claude-client.ts`.

### FR-513: Model Spec Display

- The session info bar expanded state shall display detailed specs of the active model.
- Displayed items: max output tokens, input/output price (per 1M tokens), capability badges (`vision`, `code`, `extended-thinking`).
- Model specs are looked up from static data in `src/lib/claude/model-specs.ts`. Matching uses the SDK response's `system.init.model` or the user-selected model ID; on exact-match failure, prefix matching is attempted.
- Implementation: `src/components/panels/claude/session-info-bar.tsx`, `src/lib/claude/model-specs.ts`.

### FR-514: Context Usage Visual Progress Bar

- In addition to the FR-504 context usage text, a visual progress bar shall be provided.
- Collapsed state: an inline mini progress bar (40px wide, 3px tall) next to the context percentage.
- Expanded state: a full-width progress bar (6px tall, rounded) with numeric labels.
- Color thresholds are the same as FR-504: <50% green (`bg-emerald-500`), 50-80% yellow (`bg-amber-500`), ≥80% red (`bg-red-500`).
- Implementation: `src/components/panels/claude/session-info-bar.tsx`.

### FR-515: Activity Stream Filters

- A `MessageKind`-based filter toggle bar shall be provided above the message area in the Claude chat panel.
- Filter categories: Text (`text`), Tools (`tool_use`, `tool_result`), Auto (`auto_decision`), Errors (`error`).
- Each filter button includes an icon, label, and a badge showing the current count of messages of that kind.
- Toggle action immediately hides or shows messages of the corresponding category.
- User messages (`role: 'user'`) are always displayed regardless of filters.
- Filter state is managed in `useClaudeStore.messageFilter` and all filters are reset to active on session reset.
- Implementation: `src/components/panels/claude/chat-filter-bar.tsx`, `src/components/panels/claude/claude-chat-panel.tsx`.

### FR-516: Slash Command System

- When the user types text starting with `/` in the Claude chat input, the system shall display a popover listing available slash commands.
- Slash commands are classified into two types:
  - **Client commands**: handled directly within the GUI (`/clear`, `/new`, `/usage`, `/context`, `/cost`, `/model`, `/help`)
  - **Passthrough commands**: the entire input is forwarded to Claude CLI (`/compact`, `/plan`, `/review`)
- The popover is shown while the input starts with `/` and contains no spaces; candidates are filtered by prefix matching as the user types.
- Keyboard navigation: `ArrowUp`/`ArrowDown` to move between candidates, `Enter` to execute immediately, `Tab` to fill the command name into the input, `Escape` to dismiss.
- Commands are grouped by category: Session (`/clear`, `/new`, `/compact`), Info (`/usage`, `/context`, `/cost`, `/model`, `/help`), Mode (`/plan`, `/review`).
- Client commands display results as system messages (`role: 'system'`, `kind: 'system'`) in the chat area.
- `/help` displays a Markdown table of all available slash commands.
- `/usage`, `/context`, `/cost` query the active session data from `useClaudeStore.sessionStats`.
- `/model` displays current model information and specs from `src/lib/claude/model-specs.ts`.
- Alias support: `/reset` is an alias for `/new`.
- Implementation: `src/lib/claude/slash-commands.ts`, `src/components/panels/claude/slash-command-popover.tsx`, `src/components/panels/claude/claude-chat-panel.tsx`.

### FR-517: File/Image Drag-and-Drop Input

- When files or images are dragged and dropped onto the Claude chat panel, they shall be uploaded to the project `uploads/` directory and `@uploads/filename` references shall be automatically inserted into the input field.
- Pasting images from the clipboard (Cmd+V / Ctrl+V) shall trigger the same upload→reference insertion flow.
  - Pasted images are saved with filenames in `paste-{timestamp}.{ext}` format.
- While dragging over the chat panel, a visual overlay (`DropOverlay`) shall be displayed to indicate the droppable area.
- Uploaded files are shown as file chips (`AttachedFilesBar`) above the input field; each chip includes the filename, status (uploading/done/error), and a remove button.
- Clicking the remove button on a file chip shall remove both the chip and the corresponding `@` reference from the input.
- The send button shall be disabled while files are uploading.
- All file chips are cleared upon sending a message.
- The existing `/api/files/upload` endpoint and `filesApi.upload()` are reused; file size limits (50MB/file, 200MB/total) apply.
- Text or URL drags are ignored (`hasFilePayload` validation).
- Implementation: `src/components/panels/claude/use-chat-drop.ts`, `src/components/panels/claude/drop-overlay.tsx`, `src/components/panels/claude/attached-files-bar.tsx`, `src/lib/fs/collect-files.ts`.

### FR-518: Active Editor File Context Auto-Forwarding

- The Claude chat panel shall automatically recognize the currently active (focused) file in the editor panel and include it in queries.
- Context information forwarded: file path, cursor position (line/column), unsaved status (`dirty`), pending diff status (`hasDiff`).
- Client side: When `ClaudeClient.sendQuery()` is called, active tab information is retrieved from `useEditorStore` and sent to the server via the `ClaudeQueryMessage.activeFile` field.
- Server side: In `claude-handler.mjs`'s `runQuery()`, if `activeFile` information is present, a context prefix in the form `[Active file: <path>, line <n>:<col>, unsaved, has pending diff]` is automatically prepended to the prompt.
- UI: An inline indicator (`Focusing: <path>`) showing the current active file path is displayed just above the chat panel input area. The indicator is hidden when no file is active.
- This operates independently of the existing `@` file references (FR-511). `@` references are explicit file designations, while active file context is implicit focus information.
- WebSocket message type: `ActiveFileContext` (`path`, `dirty`, `hasDiff`, `cursorLine?`, `cursorCol?`).
- Implementation: `src/types/websocket.ts`, `src/lib/websocket/claude-client.ts`, `server-handlers/claude-handler.mjs`, `src/components/panels/claude/claude-chat-panel.tsx`.

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
- When the extension is unrecognized or no file is selected, the preview panel shall render a **fully blank surface** (no help text).

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

### FR-610: Universal streaming live preview (v0.3 → v0.6 extension)

- The preview panel shall update in real time **independently of the file-selection state** when it detects **any language code fence** (` ```html `, ` ```python `, ` ```typescript `, etc.) or a `Write`/`Edit`/`MultiEdit` `tool_use` targeting **any file type** in a Claude assistant response.
- **Multi-page model (v0.6)**: Each code fence or `tool_use` within a single stream is managed as an independent "page (`LivePage`)". Each page has `id`, `kind` (html/svg/markdown/code/text), `language`, `title`, `content`, `renderable`, `complete`, and `viewMode` (source/rendered) properties.
- **Per-kind rendering**:
  - `html`: renders via iframe `srcdoc` when renderable markers are detected (`<!doctype`, `<html`, `<body`, or balanced top-level tag); falls back to source view otherwise. iframe uses `sandbox="allow-scripts"` (never `allow-same-origin`). Debounce 150ms.
  - `svg`: renders via iframe when `</svg>` closing tag is detected; source view otherwise.
  - `markdown`: always progressively renderable (react-markdown). Debounce 200ms.
  - `code`: highlight.js syntax-highlighted source view (JavaScript, TypeScript, Python, CSS, JSON, Bash, YAML, SQL, and more).
  - `text`: plain `<pre>` block source view.
- **Per-page code/preview dual mode**: Every page can toggle between source view and rendered view via `viewMode`. When `renderable` transitions from false to true, the view automatically switches to rendered mode.
- **Page navigation**: When multiple pages exist, a tab bar is displayed at the top showing kind label (HTML/SVG/MD/Code/Text) + title + streaming indicator per tab. Left/right arrows for navigation.
- **Partial-edit preservation rule**: `Edit`/`MultiEdit` `tool_use` applies `old_string → new_string` replacement against per-file baselines maintained by `UniversalStreamExtractor`. This applies to all text file types, not just HTML.
- **Live-preview page persistence**: Starting a new Claude query does not wipe `useLivePreviewStore.pages`. Follow-up `Edit`/`MultiEdit` operations can continue from previous pages.
- **Baseline disk fallback**: When no in-memory baseline exists, `UniversalStreamExtractor` emits `onNeedBaseline(filePath, apply)`. `useClaudeStore` asynchronously reads the file via `/api/files/read` and calls `apply(content)`.
- **Editor handoff rule**: File paths detected from `Write`/`Edit` `tool_use` are stored in `LivePage.filePath`. When the user opens that file in an editor tab, the live preview uses the editor tab's `content` as its source.
- On query completion (`result`), mode transitions to `'complete'`.
- Implementation: `src/lib/claude/universal-stream-extractor.ts` (universal extractor), `src/lib/claude/html-stream-extractor.ts` (legacy, deprecated), `src/stores/use-live-preview-store.ts` (multi-page `LivePage[]` model), `src/stores/use-claude-store.ts` (extractor wiring, baseline fallback), `src/components/panels/preview/live-stream-preview.tsx` (universal live preview), `src/components/panels/preview/page-nav-bar.tsx` (page navigation), `src/components/panels/preview/source-preview.tsx` (extended syntax highlighting).

### FR-611: Preview fullscreen mode (v0.3)

- The preview panel shall provide a fullscreen mode (`position: fixed; inset: 0; z-index: 9999`).
- The user must be able to exit fullscreen with `Esc`.
- Fullscreen state is tracked in `usePreviewStore.fullscreen`.

### FR-612: Contain-fit default rendering and content outline

- Previews (slides, PDF, HTML, Markdown) shall display the full content layout uncropped in **both panel and fullscreen modes**, regardless of the container's aspect ratio (contain-fit default).
  - **Slides**: reveal.js is initialized with a fixed logical size (`width: 960, height: 700`) plus `margin: 0.04`, `minScale: 0.05`, and `maxScale: 2.0`, so a single slide always fits the viewport at any aspect ratio.
  - **PDF**: a `ResizeObserver` watches the scroll container, and the first `Page.onLoadSuccess` captures the native viewport via `getViewport({ scale: 1 })`. The page is then rendered with `width = min(availableWidth, availableHeight × aspect)` so the whole page fits the container. The cached native size is reset whenever the file path changes.
  - **HTML / Live HTML / Markdown**: the iframe or document container is wrapped in a `bg-muted` outer box with an inner `ring-1 ring-border/70` so the content surface is visually separated from the surrounding UI.
- Every preview type shall **always render a visible content boundary**, even when the content background collides with the panel background (e.g. a white document on a white panel, or a black slide inside a black iframe). Specifically:
  - The slide section draws its outline in `reveal-host.html` with `box-shadow: 0 0 0 1px rgba(255,255,255,0.28), 0 6px 24px rgba(0,0,0,0.45)`.
  - The PDF page canvas is wrapped with `ring-1 ring-border/70` + `shadow-md`.
  - HTML / Live HTML iframes and the Markdown document container are wrapped with `ring-1 ring-border/70` + `shadow-sm`.
- These rules apply identically regardless of the value of `usePreviewStore.fullscreen`.
- Implementation: `public/reveal-host.html`, `src/components/panels/preview/pdf-preview.tsx`, `src/components/panels/preview/html-preview.tsx`, `src/components/panels/preview/live-html-preview.tsx`, `src/components/panels/preview/markdown-preview.tsx`, `src/components/panels/preview/slide-preview.tsx`.

### FR-613: One-click preview download

- The preview panel header shall provide a dropdown (icon: `Download`) that immediately downloads the currently rendered content. The dropdown shall list **only the formats that apply** to the current `PreviewType`.
- **Download must remain available while the live preview is streaming.** When the live preview is active (`useLivePreviewStore.mode !== 'idle'` with `autoSwitch` on), the menu treats the streamed `buffer` (or the in-memory content of the editor tab that matches `generatedFilePath`, when the user has opened the generated file) as an inline HTML artifact, so the user can **immediately download whatever has been generated so far**. The full HTML format matrix (Source `.html` / PDF / Word `.doc`) applies. For a five-page document being streamed, the user can grab the current buffer — already containing the finished pages — at any moment; once streaming finishes the menu automatically targets the final document.
- The dropdown caption distinguishes the snapshot source: `Download (streaming…)` while `mode === 'live-code'` (partial, not yet renderable), `Download live buffer` once renderable HTML is available, and `Download as` for regular file previews.
- If the live buffer is empty (`buffer === ''`) the menu is not rendered — there are no bytes to download.
- Format matrix (type → available formats):

  | PreviewType | Available formats |
  |---|---|
  | `html` | Source (`.html`), PDF (print dialog), Word (`.doc`) |
  | `markdown` | Source (`.md`), HTML (`.html`), PDF (print dialog), Word (`.doc`) |
  | `slides` | Source (`.md`), HTML (`.html`), PDF (print dialog) |
  | `image` (SVG) | Source (`.svg`), PNG (`.png`), PDF (print dialog) |
  | `image` (PNG/JPEG/GIF/WebP …) | Original file (raw bytes) |
  | `pdf` | Original file |
  | `docx` | Original file |
  | `xlsx` | Original file |
  | `pptx` | Original file |

- Text-backed types (`html`/`markdown`/`slides`, plus `.svg` images) reuse the in-memory content from the editor tab when available; otherwise they fetch from disk via `filesApi.read()` before converting and downloading. File-backed binary types (`pdf`/`image` except SVG/`docx`/`xlsx`/`pptx`) stream the original bytes from `/api/files/raw?path=...`.
- **PDF export options dialog**: When the user selects PDF export, a `PdfExportDialog` is shown before the browser print dialog, offering the following options:
  - **Page orientation**: Auto-detect (default, respects the HTML document's own `@page` rules) / Portrait / Landscape.
  - **Page size**: A4 (default) / Letter / Legal.
  - In auto-detect mode, if the HTML content contains presentation structures (Reveal.js, multiple `<section>` elements) or `@page { … landscape }` rules, a landscape recommendation hint is displayed (`detectLandscapeHint()`).
- Print CSS is dynamically generated via `buildPrintCss(options)`, reflecting the selected orientation and size in the `@page { size: … }` rule. In auto mode no `@page` rule is injected, fully preserving the HTML document's existing layout.
- Enhanced page-break rules: `<hr>` acts as a page separator via `page-break-after: always`; `<section>`, `.slide`, and `[data-page-break]` elements trigger `page-break-before: always`. Headings (`h1`–`h6`) are protected with `page-break-after: avoid` to prevent orphaned titles.
- PDF export opens `window.print()` to trigger the browser print dialog and lets the user save via the OS "Save as PDF" flow — the same policy as the artifact export pipeline (FR-1004). No server-side PDF renderer (Puppeteer, etc.) is required.
- DOCX/XLSX/PPTX binary types expose only "Original file" because the viewer already reads the file via `/api/files/raw`. Transcoding (e.g. DOCX → PDF) is out of scope for v1.0.
- Implementation: `src/lib/preview/preview-download.ts` (adapts the live preview state into an `ExtractedArtifact` shape and reuses the download/print pipeline in `src/lib/claude/artifact-export.ts`), `src/components/panels/preview/preview-download-menu.tsx` (header dropdown + PDF dialog integration), `src/components/panels/preview/pdf-export-dialog.tsx` (PDF export options dialog), `src/components/panels/preview/preview-panel.tsx` (header placement).

### FR-614: Preview source/rendered view toggle (v0.5)

- Text-backed preview types (`html`, `markdown`, `slides`) shall provide a natural switch between the **rendered view** and the **source view**. Binary or render-only types (`pdf`, `image`, `docx`, `xlsx`, `pptx`) are not toggleable.
- The preview panel header shall expose a `Code` / `Eye` icon toggle button (to the left of `PreviewDownloadMenu`) whose icon indicates the **target state** (flip-to), matching the convention already used by `live-html-preview.tsx`. `aria-label`/`title` describe the target (`Show source` / `Show rendered`).
- The toggle state is stored in `usePreviewStore.viewMode: 'rendered' | 'source'` with a default of `'rendered'`. Calling `setFile` resets `viewMode` to `'rendered'` so the source view never sticks across file switches.
- The source view is rendered with `highlight.js` syntax highlighting (`<pre><code class="hljs language-xml|markdown">`). `highlight.js/styles/github-dark.css` is imported once from the root layout to keep highlighting legible in both light and dark themes. The container follows the FR-612 outline rules (`bg-muted` outer + `ring-1 ring-border/70 shadow-sm`).
- The live HTML streaming preview (`FR-610`) keeps its **existing internal toggle**; the header toggle is hidden when `showLive === true` (`autoSwitch && liveMode !== 'idle'`). The two toggle paths are mutually exclusive.
- Implementation: `src/stores/use-preview-store.ts` (`viewMode`, `setViewMode`, `toggleViewMode`, `isSourceToggleable` helper), `src/components/panels/preview/preview-panel.tsx` (header toggle button), `src/components/panels/preview/preview-router.tsx` (source view branch), `src/components/panels/preview/source-preview.tsx` (new syntax-highlighted viewer), `src/app/layout.tsx` (highlight theme CSS).

### FR-615: Preview TTS (Text-to-Speech) read-aloud (v0.6)

- Text-based previews (`html`, `markdown`, `slides`) shall provide a **read-aloud** feature using the browser's built-in Web Speech API (`window.speechSynthesis`).
- The preview panel header shall expose a `Volume2` / `VolumeX` icon toggle button for play/stop. While speaking, the button is highlighted with `bg-accent`.
- The toggle button is shown only when:
  - The preview type is one of `html`, `markdown`, or `slides`
  - Live preview mode is inactive (`showLive === false`)
  - The browser supports `speechSynthesis`
- Text extraction logic:
  - **Markdown**: raw markdown text is used as-is
  - **HTML**: parsed via `DOMParser`, then `body.textContent` is extracted
  - **Slides**: HTML `<section>` elements are parsed; only the text of the slide at `selectedSlideIndex` is extracted. If no index is provided, all slides are joined with `.` separators
- Ongoing TTS is automatically stopped when the previewed file changes.
- A keep-alive workaround for Chrome/Chromium's 15-second auto-pause bug calls `pause()`→`resume()` every 10 seconds.
- On component unmount, `speechSynthesis.cancel()` is called for cleanup.
- The system default voice is used; no voice selection UI is provided.
- Implementation: `src/hooks/use-speech-synthesis.ts` (Web Speech API wrapper hook), `src/lib/preview/extract-preview-text.ts` (text extraction utility), `src/components/panels/preview/preview-panel.tsx` (header TTS button).

---

## 3.7 Presentation Features (FR-700)

### FR-701: reveal.js slide rendering (multi-page vertical scroll)

- When rendering HTML-based slides, all `<section>` elements shall be parsed and displayed in a **vertical scroll** layout with page separation. Instead of a single-page reveal.js default view, a card layout shall be provided so all slides are visible at a glance.
- Each slide card shall render as a scaled-down preview (iframe `srcDoc`) with reveal.js CSS applied, showing a slide number badge in the top-left corner.
- The slide list header shall display the total number of slides and the currently selected slide number.
- Data model: a JSON array `[{ id, html, css, notes, transition, background }]`.

### FR-702: Slide selection and navigation

- Each slide card shall be **selectable via click**. The selected slide shall be visually distinguished with a `border-primary` highlight border and `shadow-lg` shadow.
- Selection state shall be managed via `usePreviewStore.selectedSlideIndex` (0-based) and automatically reset to 0 on file change (`setFile`).
- When the number of slides changes (from `<section>` parsing), the selected index shall be automatically clamped to stay within bounds.

### FR-703: Conversational slide editing (Edit mode)

- The preview panel header shall provide a `Pencil` icon Edit toggle button, displayed only when the type is `slides` and `viewMode === 'rendered'`. When active, it is highlighted with `bg-accent`.
- Edit mode state shall be managed via `usePreviewStore.slideEditMode` and automatically reset to `false` on `setFile` calls.
- When entering Edit mode, the following UI shall be provided for the selected slide:
  1. **Prompt input**: A text input field with a `Send` button at the top allows users to request slide modifications in natural language. `Enter` submits the prompt, which includes the current slide HTML context and is sent to Claude via `sendQuery`.
     - e.g., "Make the title larger"
     - e.g., "Change the background color to blue"
  2. **HTML code editor**: A `<textarea>`-based code editing area where users can directly modify the selected slide's `<section>` HTML. `Cmd+S`/`Ctrl+S` saves changes.
  3. **Live preview**: A live preview of the currently edited HTML is displayed to the right of the editing area.
- On save, the modified `<section>` HTML is reassembled into the full HTML (`reconstructHtml`) and synchronized to both the editor tab and disk.
- Implementation: `src/components/panels/preview/slide-preview.tsx` (`SlideCard`, `SlideEditor` components), `src/stores/use-preview-store.ts` (`slideEditMode`, `selectedSlideIndex`), `src/components/panels/preview/preview-panel.tsx` (Edit button), `src/components/panels/preview/preview-router.tsx` (`onContentChange` callback).

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
| `Cmd+Shift+O` / `Ctrl+Shift+O` | Open current tab's cwd in the OS default terminal app (`FR-420`) — active globally |
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

- `@parcel/watcher` v2 shall detect file changes in the project directory. It uses native FSEvents (macOS) / inotify (Linux) / ReadDirectoryChangesW (Windows) and consumes a single OS handle per watched root (see ADR-024).
- Change events shall be broadcast on the WebSocket `/ws/files` channel.
- The native `create` / `update` / `delete` events are normalized to `add` / `change` / `unlink`; the channel additionally emits `ready` (subscription ready) and `error` (watcher failure).
- The following subtrees are excluded from watching via both a native ignore glob list and a JS-side dotfile filter: `node_modules`, `.next`, `.git`, `.claude`, `dist`, `build`, `out`, `coverage`, `test-results`, `playwright-report`, `.turbo`, `.cache`, `.claude-worktrees`. `.claude-project` is explicitly **kept** visible because it holds user-facing project settings.

### FR-908: Runtime project hot-swap (v0.3)

- The system shall allow switching the project root at runtime (no server restart).
- `GET /api/project` returns the current root (`null` when nothing is active) plus the recents list.
- `POST /api/project` (body `{ path }`) switches the root after the following checks:
  - Absolute path (relative paths are rejected with `4400`)
  - Directory exists (`4404` / `4400`)
  - Readable (`4403`)
  - **Filesystem root (`/` or Windows drive root) is rejected (`4403`)**. The former `$HOME` ban has been removed — users can now re-root to `~` or arbitrary ancestors through the file explorer's Up button, breadcrumb, or "Open as project root" context menu (`FR-209`). Dotfile access continues to be blocked by `resolveSafe`'s deny list.
- **Bootstrap root resolution**: (1) `PROJECT_ROOT` env var, (2) `~/.claudegui/state.json` `lastRoot`, (3) **no fallback** — if none of these resolves, `getActiveRoot()` returns `null`. The previous silent `process.cwd()` fallback has been removed to prevent the server's launch directory from quietly becoming the project root (which caused Claude to generate files in arbitrary locations).
- **Behavior when no active root is set**:
  - After `useProjectStore.refresh()` completes at boot, if `activeRoot === null` the client **force-opens the project picker modal** (implemented in `AppShell` via `useEffect`).
  - The Claude WS handler, on `runQuery`, checks `getActiveRoot()` — if `null` it immediately emits `{ code: 4412, message: "No project is open. Open a folder in the file explorer before running Claude queries." }` and does not start the query.
  - `resolveSafe`/`getProjectRoot()` throw `SandboxError('No project is open', 4412)` while the root is `null`. File API routes map this to HTTP `412 Precondition Failed`.
  - The `@parcel/watcher` subscription remains idle while the root is `null`; the `onActiveRootChange` listener starts the real subscription once a root is set.
  - Newly spawned terminal sessions fall back to the user's home directory (`os.homedir()`) when the root is `null`, preserving the existing "running sessions are never killed" policy.
- On switch:
  - The `@parcel/watcher` subscription is `unsubscribe()`d on the old root and re-subscribed on the new one.
  - All `/ws/files` clients receive `{ type: 'project-changed', root, timestamp }`.
  - Newly spawned PTY sessions use the new root as `cwd` (existing sessions are left alone).
  - Claude queries also use the new root as `cwd`.
- Clients that receive `project-changed` reset their editor tabs and preview selection and reload the file tree.
- State is persisted to `~/.claudegui/state.json` as `{ lastRoot, recents }`. While the active root is `null`, nothing is written to `state.json`.
- Implementation: `src/lib/project/project-context.mjs`, `src/app/api/project/route.ts`, `src/stores/use-project-store.ts`, `src/components/modals/project-picker-modal.tsx`, `src/components/layout/app-shell.tsx`, `server-handlers/claude-handler.mjs`, `src/lib/fs/resolve-safe.ts`, `server-handlers/files-handler.mjs`.

---

## 3.10 Generated Content Gallery (FR-1000)

### FR-1001: Automatic artifact extraction

- Whenever the system receives a Claude assistant message, it shall parse the message body and automatically extract the following kinds of "artifacts" (generated content):
  - Fenced code blocks in any language: HTML, SVG, Markdown, TypeScript/JavaScript, Python, Go, Rust, Shell, CSS, JSON, YAML, and so on.
  - Stand-alone `<!doctype html> … </html>` documents that appear outside of any fence.
  - Stand-alone `<svg …> … </svg>` elements that appear outside of any fence.
- Text-derived artifacts have a stable id of the form `{messageId}:{index}`.
- Artifacts derived from Write/Edit tool_use blocks use a path-based id of the form `file:{absolutePath}` so repeat Writes/Edits to the same file collapse into a single entry (see FR-1008).
- On session restore the same ids are reused so duplicates do not accumulate.
- Text blocks shorter than 24 characters are treated as noise and dropped.
- The set of artifact kinds is extended to: `html`, `svg`, `markdown`, `code`, `text`, `image`, `pdf`, `docx`, `xlsx`, `pptx`. Binary kinds (`image`/`pdf`/`docx`/`xlsx`/`pptx`) are stored with `source = "file"` and an absolute `filePath` instead of inline content.

### FR-1002: Auto-popup behaviour

- If one or more new artifacts are extracted during a single Claude turn, the Generated Content gallery modal shall open automatically when the turn ends (the `result` event) **or on error** (the `error` event). Calling `flushPendingOpen` on error ensures artifacts collected before the failure are not silently discarded.
- If the user disables "Auto-open on new content" in the gallery toolbar, the modal shall not open on its own.
- When the gallery is opened manually (`open()` with no explicit `highlightedId`), the most recent artifact is auto-selected so the preview pane is never blank.
- Artifact extraction performed while loading session history is a "silent extract" that must not trigger the auto-popup.

### FR-1003: Persistent storage (localStorage)

- Extracted artifacts shall be persisted in the browser's `localStorage` and the gallery shall be restored intact across page reloads.
- Storage key: `claudegui-artifacts` (zustand `persist` middleware, `version: 4`). Up to v2 only `artifacts`/`autoOpen` were persisted; starting at v3 the gallery's `modalSize` (see FR-1005) is persisted alongside them.
- **In-memory cap: 200 artifacts; localStorage persistence cap: 30 artifacts.** `partialize` uses `artifacts.slice(-30)` to store only the 30 most recent entries, protecting the localStorage quota. In memory, up to 200 artifacts are retained for the duration of the session.
- The `autoOpen` preference is persisted under the same key.
- Binary artifacts (`source: "file"`) are not base64-encoded into localStorage; only their absolute `filePath` and metadata are stored, keeping the persisted payload small.
- After rehydration the `onRehydrateStorage` hook collects every artifact with a `filePath` and re-registers them via `POST /api/artifacts/register` so FR-1009's cross-project access path is restored.
- v1 → v2 migration: legacy v1 records are patched to `source: "inline"`, `updatedAt: createdAt` so old galleries keep rendering.
- v3 → v4 migration: trims legacy 200-item data to 30 entries.

### FR-1004: Copy and export

- Every artifact in the gallery supports two actions:
  - **Copy** — inline artifacts write their raw text to the clipboard; file-backed artifacts write the absolute `filePath` instead (`navigator.clipboard.writeText`).
  - **Export** — a dropdown menu offers the applicable formats for the artifact's `kind` and `source`:
    - **Source** — download using the language-appropriate extension (`.ts`, `.py`, `.html`, `.svg`, `.md`, etc.) for inline text artifacts.
    - **HTML (.html)** — download the markdown/code/SVG artifact as a stand-alone `<!doctype html>` document.
    - **PDF** — inject a hidden `<iframe>` into the current document with the standalone HTML as `srcdoc`, await `decode()` of every `<img>` plus two `requestAnimationFrame` ticks, then call `iframe.contentWindow.print()` so the OS "Save as PDF" dialog fires. Cleanup runs from the `afterprint` event with a 60 s safety fallback. The generated HTML now includes `@page { size: A4; margin: 15mm }` plus `@media print` rules (`page-break-inside: avoid`, color preservation). Content over 1.5 MB falls back from `srcdoc` to a blob URL. This replaces the previous popup-window approach, which was unreliable under popup blockers, racy timers, and missing print CSS.
    - **Word (.doc)** — download MS Word-compatible HTML with the `application/msword` MIME type (opens in Word and Pages).
    - **SVG → PNG** — rasterise via `<canvas>` and download a PNG.
    - **Plain text (.txt)** — fallback for generic code and text artifacts.
    - **Original (.docx/.xlsx/.pptx/.pdf/image)** — file-backed binary artifacts. `GET /api/artifacts/raw?path=…` is tried first and `GET /api/files/raw` is used as a fallback so the raw file on disk can be downloaded verbatim.
- The Export menu is built dynamically by `availableExports(artifact)` based on the artifact's `kind` and `source`.

### FR-1005: Gallery UI

- The gallery is a modal dialog laid out as a left-hand list and a right-hand detail preview.
- **Search and filter**: the sidebar header provides a text search input and kind-filter chips (All/HTML/SVG/Code/…). Search matches case-insensitively against title, language, and file path. Kind chips are rendered dynamically based on the kinds present among current artifacts.
- Each list row shows a kind badge (HTML/SVG/Markdown/Code/Text/Image/PDF/DOCX/XLSX/PPTX), the artifact title (the file's basename for file-backed entries), its language or extension, and a relative timestamp. File-backed artifacts additionally show the last two path segments.
- Every list row exposes a hover-revealed per-row Delete (Trash) button that calls `useArtifactStore.remove(id)` on click and stops click propagation so the row's default select behaviour is not triggered. If the currently selected artifact is the one being deleted, the existing auto-reselect effect promotes the next entry. For accessibility the row itself is `role="button"` + `tabIndex=0` with Enter/Space handlers, and the inner delete button exposes `aria-label="Delete {title}"`.
- The detail area exposes a **Preview / Source** toggle. Preview is the default, and per-kind rendering is as follows:
  - **HTML**: `<iframe sandbox="allow-scripts">` with `srcDoc` (no `allow-same-origin`, matching the main preview-panel policy).
  - **SVG**: rendered via `data:image/svg+xml;charset=utf-8,…` in an `<img>` so embedded scripts and event handlers cannot execute.
  - **Markdown**: reuses the existing `MarkdownPreview` component (`react-markdown` + `remark-gfm` + `rehype-sanitize`).
  - **Image**: inline SVG uses a data URI; file-backed images are served from `GET /api/artifacts/raw?path=…` through an `<img>` tag.
  - **PDF**: reuses `PdfPreview` via the `srcOverride` prop, pointing at `/api/artifacts/raw`.
  - **DOCX**: `DocxPreview` converts bytes to HTML via `mammoth/mammoth.browser` and injects the result into a fully sandboxed iframe (`sandbox=""`, no scripts).
  - **XLSX/XLSM**: `XlsxPreview` converts each sheet with SheetJS (`xlsx`) via `sheet_to_html` and exposes a sheet tab switcher.
  - **PPTX**: `PptxPreview` unzips the OOXML with JSZip, pulls title + body lines from the `<a:t>` runs in every `ppt/slides/slideN.xml`, and surfaces referenced media images as `URL.createObjectURL` thumbnails (approximate rendering).
  - **Code/Text**: Preview is not offered; the view falls back to Source mode.
  - **File-backed binary whose source project is inactive and whose registry registration failed**: a fallback card shows the title, absolute path, and an Export button.
- Copy, Export, and Delete actions remain available, along with the top-bar `Auto-open on new content` checkbox and `Clear all` button.
- **Resizable modal**: the dialog has a bottom-right drag handle that lets the user freely resize the popup. Size is clamped to a minimum of 640×480 px and a maximum of `viewport − 20 px`. The picked size is persisted via `useArtifactStore.setModalSize` into the `claudegui-artifacts` store (`version: 3`), so it survives reloads and restarts. Because Radix Dialog centers content with `translate(-50%, -50%)`, pointer deltas are multiplied by 2 so the handle tracks the cursor 1:1. The default size is `min(1024px, 90vw) × min(720px, 80vh)`, and the dialog re-clamps automatically when the viewport shrinks below a previously persisted size.
- Accessibility: the modal is built on Radix Dialog and closes on ESC.

### FR-1006: Entry point, badge, and shortcut

- A `FileStack` icon button in the Claude chat panel header shall let the user open the gallery manually.
- A small badge on that button shows the current artifact count (capped at `99+`).
- The global shortcut **`Cmd/Ctrl + Shift + A`** toggles the gallery (`src/hooks/use-global-shortcuts.ts`).

### FR-1008: Capture from Write/Edit tool_use

- The system shall observe Claude's `Write`/`Edit`/`MultiEdit` tool_use blocks and ingest them into the artifact gallery in addition to the fenced-text pipeline. This fixes the bug where the final slide — written straight to disk without an inline fenced block — was missing from "Generated Content".
- Processing rules:
  - **Write**: classify by the `file_path` extension (see the kind list in FR-1001).
    - Text-ish kinds (html/svg/markdown/code/text): snapshot `input.content` into `content` and mark `source = "inline"`.
    - Binary kinds (image/pdf/docx/xlsx/pptx): keep no content, only `source = "file"` and `filePath = input.file_path`.
  - **Edit/MultiEdit**: look up the existing artifact by `filePath`, then let `artifactFromEdit` apply the `edits[]` patches against its inline content and bump `updatedAt`. If no existing entry is found, the helper returns `null` and nothing changes.
  - All tool_use artifacts share the `file:{absolutePath}` id so `dedupe()` preserves the original `createdAt` while overwriting the latest `content`/`updatedAt`.
- Store behaviour:
  - `useArtifactStore.ingestToolUse(messageId, sessionId, tool, { silent? })` is the entry point. `use-claude-store`'s assistant-event handler runs a loop right after `extractor.feedToolUse(tool)` and calls it for every tool.
  - Non-silent calls push the new id into `pendingTurn`, so the gallery auto-popup flow from FR-1002 fires on the turn's `result` event.
  - On success the `filePath` is forwarded to `POST /api/artifacts/register` so FR-1009's cross-project access path works.
- Implementation: `src/lib/claude/artifact-from-tool.ts`, the `classifyByPath`/`isBinaryKind`/`titleFromPath` helpers in `src/lib/claude/artifact-extractor.ts`, and `ingestToolUse`/`findByFilePath` in `src/stores/use-artifact-store.ts`.

### FR-1009: Cross-project binary access and office viewers

- The system shall let the user preview and export image/PDF/Word/Excel/PowerPoint artifacts captured earlier in the current Claude session even after switching to a different project.
- Server-side artifact registry
  - `src/lib/claude/artifact-registry.ts` holds an in-process Map capped at 1024 paths (oldest evicted when the cap is hit).
  - `POST /api/artifacts/register` — accepts `{ paths: string[] }`, verifies each is an absolute path that exists and stays under the 50 MB `MAX_BINARY_SIZE` cap, then adds it to the registry. The route uses the same rate limiter (`rateLimit`/`clientKey`) as the main files API.
  - `GET /api/artifacts/raw?path=<abs>` — streams the bytes of a previously registered path, bypassing the project-scoped `resolveSafe` sandbox but limited to files the registry has already admitted. Content-Type is resolved through a MIME table that covers `docx`/`xlsx`/`xlsm`/`pptx`, PDFs, and images.
- Client-side behaviour
  - `useArtifactStore.ingestToolUse` registers every new binary artifact's `filePath` via `registerArtifactPaths`.
  - `onRehydrateStorage` re-registers every persisted file-backed artifact in a single call so server restarts are transparent.
  - `src/lib/claude/artifact-url.ts` exposes `fetchArtifactBytes(filePath)`, which tries `/api/artifacts/raw` first and falls back to `/api/files/raw`. The DOCX/XLSX/PPTX converters all use it.
  - The `downloadBinaryFile` helper in `artifact-export.ts` follows the same order for Export downloads.
- Viewer dependencies
  - `mammoth` — DOCX → HTML. Dynamically imported so its bundle only loads on the first DOCX preview.
  - `xlsx` (SheetJS) — XLSX → HTML table. Dynamically imported.
  - `jszip` — PPTX OOXML unpacking. Dynamically imported.
- Security constraints
  - The registry is in-memory only; it is dropped on server restart and repopulated through the hydration path.
  - Even admitted paths will return `404`/`413` from `/api/artifacts/raw` if the file no longer exists or exceeds the 50 MB cap.
  - `resolveSafe`'s denied-segment list (`.env`, `.git`, `.claude`, credentials) is not re-checked here because Claude does not Write to those paths in practice.
- Implementation: `src/app/api/artifacts/register/route.ts`, `src/app/api/artifacts/raw/route.ts`, `src/lib/claude/artifact-registry.ts`, `src/lib/claude/artifact-url.ts`, `src/components/panels/preview/docx-preview.tsx`, `src/components/panels/preview/xlsx-preview.tsx`, `src/components/panels/preview/pptx-preview.tsx`, `src/components/panels/preview/pdf-preview.tsx` (`srcOverride` prop).

### FR-1007: Implementation

- `src/lib/claude/artifact-extractor.ts` — regex-based extractor + `classifyByPath`/`isBinaryKind`/`titleFromPath`.
- `src/lib/claude/artifact-from-tool.ts` — builds and patches artifact records from Write/Edit/MultiEdit tool_use.
- `src/lib/claude/artifact-export.ts` — inline copy/download, print-to-PDF, Word, PNG, and file-backed "Original" export helpers.
- `src/lib/claude/artifact-registry.ts` — server-side in-process artifact path registry.
- `src/lib/claude/artifact-url.ts` — `/api/artifacts/raw` → `/api/files/raw` fallback fetch helper.
- `src/app/api/artifacts/register/route.ts`, `src/app/api/artifacts/raw/route.ts` — REST endpoints for the artifact registry.
- `src/stores/use-artifact-store.ts` — zustand store (`persist` v2, `ingestToolUse`, `findByFilePath`, hydration re-registration).
- `src/components/modals/artifacts-modal.tsx` — the gallery dialog (Preview/Source toggle, file-backed fallback card, 10-kind badges).
- `src/components/panels/preview/docx-preview.tsx` / `xlsx-preview.tsx` / `pptx-preview.tsx` — office previewers.
- `src/components/panels/preview/pdf-preview.tsx` — adds the `srcOverride` prop so artifact URLs can be used.
- `src/stores/use-preview-store.ts` — `PreviewType`/`detectPreviewType` extended for docx/xlsx/pptx.
- `src/components/panels/preview/preview-router.tsx` — routes the extended types to the new viewers.
- `src/components/panels/claude/claude-chat-panel.tsx` — trigger button and badge.
- `src/hooks/use-global-shortcuts.ts` — `Cmd/Ctrl + Shift + A` toggle shortcut.
- `src/stores/use-claude-store.ts` — calls `ingestToolUse` on every assistant-event tool_use, invokes the extractor on session load, and flushes the gallery auto-popup on `result`.
- `src/stores/use-claude-store.ts` — calls the extractor when assistant messages arrive and when sessions are loaded; flushes the auto-popup on the `result` event.

---

## 3.11 Installation and Desktop Launcher (FR-1100)

### FR-1101: One-line installer creates a desktop shortcut

- `scripts/install/install.sh` (macOS / Linux) and `scripts/install/install.ps1` (Windows) shall, after the build step, automatically create a **ClaudeGUI shortcut** on the user's desktop.
- The installer must support skipping this step via `--no-desktop-icon` (bash) or `-NoDesktopIcon` (PowerShell). The environment variable `CLAUDEGUI_NO_DESKTOP_ICON=1` has the same effect.
- The installer must copy `<repo>/public/branding/claudegui.svg|.ico|claudegui-{128,256,512}.png` into the user's icon directory:
  - macOS / Linux: `~/.claudegui/icons/`
  - Windows: `%LOCALAPPDATA%\ClaudeGUI\icons\`
- The shortcut is created in an OS-specific form:

| OS | File | Double-click action | Icon handling |
|----|------|--------------------|---------------|
| macOS | `~/Desktop/ClaudeGUI.app` (lightweight `.app` bundle) | Opens a Terminal window via `open -a Terminal` to run the launcher script | `Contents/Resources/AppIcon.icns` carries the mascot icon — same character as the favicon |
| Linux | `~/Desktop/ClaudeGUI.desktop` | Runs the launcher through the `x-terminal-emulator` → `gnome-terminal` → `konsole` → `xterm` fallback chain | `Icon=` field references the absolute SVG path; on GNOME the installer also runs `gio set ... metadata::trusted true` |
| Windows | `%USERPROFILE%\Desktop\ClaudeGUI.lnk` | A PowerShell console window created via `WScript.Shell.CreateShortcut` | `IconLocation` set to `claudegui.ico,0` |

- The macOS `.app` bundle is created locally by the installer, so it does not carry a Gatekeeper quarantine attribute and runs without code signing. Unlike the legacy `.command` approach, the mascot icon is displayed in Finder and the Dock.

### FR-1102: Launcher script behaviour

- The launcher script lives at:
  - macOS / Linux: `~/.claudegui/bin/claudegui-launcher.sh`
  - Windows: `%LOCALAPPDATA%\ClaudeGUI\bin\claudegui-launcher.ps1`
- When executed it shall, in order:
  1. Print a ClaudeGUI banner (URL, log file, how to stop) at the top of the console window.
  2. `cd $INSTALL_DIR`, then export `NODE_ENV=production` and `PORT=${CLAUDEGUI_PORT:-${PORT:-3000}}`.
  3. Detach a **background poller** that issues HEAD requests against `http://localhost:$PORT` every 0.5 s for up to 30 s.
  4. As soon as the poller receives a 2xx/3xx response it opens the URL in the OS default browser:
     - macOS: `open`
     - Linux: `xdg-open`
     - Windows: `Start-Process`
  5. Run `node server.js` in the **foreground**, tee'ing stdout/stderr to both the console and the log file (`tee` / `Tee-Object`).
  6. When the user closes the console window or presses `Ctrl+C`, SIGHUP/SIGINT propagates to the child so `node server.js` exits with the window (close window = stop server).
- Log file path:
  - macOS / Linux: `~/.claudegui/logs/launcher.log` (append)
  - Windows: `%USERPROFILE%\.claudegui\logs\launcher.log` (append)

### FR-1103: Brand icon assets and favicon integration

- A single SVG source (`public/branding/claudegui.svg`) is the authoritative source for every icon raster.
- The build script (`scripts/build-icons.mjs`, macOS only) uses `qlmanage` + `sips` to produce 16/32/48/64/128/180/256/512 PNGs and packs six of those sizes into a Vista+-compatible PNG-in-ICO `claudegui.ico`.
- `src/app/icon.svg` and `src/app/apple-icon.png` (180×180) are exposed automatically by Next.js App Router file-based metadata, so opening `localhost:3000` shows the same mascot as a favicon without any explicit `<link rel="icon">`.
- Tauri desktop app icons are also generated from the same SVG source: `installer/tauri/src-tauri/icons/` receives `32x32.png`, `128x128.png`, `128x128@2x.png` (256×256), `icon.ico`, and `icon.icns` (built via `iconutil`).
- The desktop shortcut, Tauri native app, and the browser favicon all use the **same mascot**, ensuring visual consistency across every entry point.
- Implementation: `public/branding/claudegui.svg`, `scripts/build-icons.mjs`, `src/app/icon.svg`, `src/app/apple-icon.png`, `installer/tauri/src-tauri/icons/`, `scripts/install/install.sh`, `scripts/install/install.ps1`.

---

## 3.12 Smart Prompt Intent Detection (FR-1200)

Automatically detect content-generation intent from user chat input and inject optimized system prompts to improve generation quality.

### FR-1201: Slide Generation Intent Detection

- Detect slide/presentation-related keywords (슬라이드, 프레젠테이션, PPT, 발표자료, presentation, slides, etc.) in user input.
- Detection runs client-side for zero-latency response.
- Implementation: `src/lib/claude/intent-detector.ts`.

### FR-1202: Slide Preferences Dialog

- When slide intent is detected, display a confirmation dialog before generation.
- Collected fields:
  - **Purpose**: Internal report, academic presentation, teaching material, investor pitch, other (custom input)
  - **Text size**: Small / Medium / Large
  - **Color tone**: Deep Navy, Corporate Blue, Warm, Minimal, Dark, Forest
  - **Additional notes**: Free-text (optional)
- A "Generate with defaults" button applies default values.
- On cancel, the original input is restored to the text area.
- Implementation: `src/components/panels/claude/slide-preferences-dialog.tsx`.

### FR-1203: Server-side Prompt Injection

- The client includes `intent` metadata in the WebSocket message.
- The server looks up a prompt template from the registry by `intent.type` and prepends design guidelines to the user's prompt.
- The injected system prompt is never shown in the user UI (the user sees only their original message).
- Slide template guidelines include:
  - Visual consistency (color palette, fonts)
  - Z-pattern layout, 60/40 visual-to-text ratio
  - Diverse visual elements (icons, charts, diagrams)
  - Action Title style
- Implementation: `server-handlers/prompt-templates/slides.mjs`, `server-handlers/prompt-templates/registry.mjs`.

### FR-1204: Intent Registry Extensibility

- The intent registry uses a `{ type: () => import('./template.mjs') }` pattern.
- New content types (reports, diagrams, etc.) can be supported by adding a single entry to the registry.
- Implementation: `server-handlers/prompt-templates/registry.mjs`, `src/types/intent.ts`.

---

## 3.13 Remote Access (FR-1300)

Allows switching the server binding address from `127.0.0.1` (local only) to `0.0.0.0` (all interfaces), enabling other devices on the same network to access ClaudeGUI.

### FR-1300: Remote Access Toggle

- The user can open the remote access settings modal by clicking the Globe icon button in the header.
- The modal provides an ON/OFF toggle switch for remote access.
- When enabled, the server binding address changes to `0.0.0.0`.
- When disabled, it reverts to `127.0.0.1`.
- After changing settings, the "Apply & Restart" button triggers an in-process server restart.

### FR-1301: Token Authentication

- A UUID v4 token is automatically generated when remote access is enabled.
- Remote clients authenticate via `Authorization: Bearer <token>` header or `?token=<token>` URL parameter.
- Localhost (`127.0.0.1`, `::1`) requests are exempt from token validation.
- The modal provides copy and regenerate buttons for the token.

### FR-1302: Server Configuration Persistence

- Settings are stored in `~/.claudegui/server-config.json`.
- Config schema: `{ "remoteAccess": boolean, "remoteAccessToken": string|null }`.
- The server reads the config file at startup to determine the binding address and token.
- The `HOST` environment variable takes precedence over the config file when explicitly set.

### FR-1303: Network Information Display

- The remote access modal displays the current LAN IP list (via `os.networkInterfaces()`).
- The status bar shows remote access status (displays "Remote (IP)" text when active).
- The Globe icon in the header turns green when remote access is active.

### FR-1304: Server Management API

- `GET /api/server/status` — returns server status (hostname, port, remoteAccess, hasToken, localIPs, uptime).
- `GET /api/server/config` — returns current configuration.
- `PUT /api/server/config` — saves configuration (remoteAccess, remoteAccessToken).
- `POST /api/server/restart` — triggers in-process server restart.
- All management APIs are accessible only from localhost.

### FR-1305: Tauri Desktop App Integration

- The Tauri launcher reads `~/.claudegui/server-config.json` at startup to determine the HOST environment variable.
- Supports sidecar process restart via the Tauri IPC `restart_server` command.
- The web UI uses `isTauri()` detection to select the appropriate restart path.
- Implementation: `installer/tauri/src-tauri/src/main.rs`, `src/lib/runtime.ts`.
