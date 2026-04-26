# 2. Component Design

> English mirror of [`docs/architecture/02-component-design.md`](../../architecture/02-component-design.md).

## 2.1 Frontend Component Tree

```
<App>
  <RootLayout>
    <Header>
      <Logo />
      <SessionIndicator />
      <CommandPaletteTrigger />  (cmdk)
      <SettingsButton />
    </Header>

    {isDesktop ? (
      <!-- Desktop layout (>= 1280px): all 5 panels collapsible -->
      <PanelGroup direction="horizontal">
        <Panel id="file-explorer" ref={fileExplorerRef} collapsible collapsedSize={0}>
          <FileExplorerPanel />
        </Panel>

        <PanelResizeHandle onDoubleClick={resetAdjacentPanels} />

        <Panel id="center">
          <PanelGroup direction="vertical">
            <Panel id="editor" ref={editorRef} collapsible collapsedSize={0}>
              <EditorPanel />
            </Panel>

            <PanelResizeHandle onDoubleClick={resetAdjacentPanels} />

            <Panel id="terminal" ref={terminalRef} collapsible collapsedSize={0}>
              <TerminalPanel />
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle onDoubleClick={resetAdjacentPanels} />

        <Panel id="claude" ref={claudeRef} collapsible collapsedSize={0}>
          <ClaudeChatPanel>
            <ClaudeTabBar />          {/* tab create/close/rename/context menu */}
            <ClaudeChatView />        {/* messages, input, streaming for the active tab */}
            <SessionInfoBar tabId={activeTabId} />
          </ClaudeChatPanel>
        </Panel>

        <PanelResizeHandle onDoubleClick={resetAdjacentPanels} />

        <Panel id="preview" ref={previewRef} collapsible collapsedSize={0}>
          <PreviewPanel />
        </Panel>
      </PanelGroup>
    ) : (
      <!-- Mobile layout (< 1280px) -->
      <MobileShell />
    )}

    <StatusBar />
    <CommandPalette />                 (cmdk modal)
    <PermissionRequestModal />         (when Claude requests permission)
  </RootLayout>
</App>
```

**Panel collapse implementation**: all 5 panels use the `collapsible` prop and `ImperativePanelHandle` imperative API from `react-resizable-panels`. Instead of conditional rendering (`{!collapsed && <Panel />}`), panels are always rendered and controlled via `collapse()`/`expand()` calls, preserving internal state (terminal buffers, editor models, etc.) across collapses. The store's `setCollapsed` action is synced to `ImperativePanelHandle.collapse()`/`expand()` through `useEffect` hooks.

**Double-click resize reset**: each `PanelResizeHandle` wires an `onDoubleClick` handler (`handleDoubleClickReset`) that resets adjacent panels to `DEFAULT_PANEL_SIZES`.

**Responsive mobile layout**: the `useMediaQuery('(min-width: 1280px)')` hook detects viewport width. Below 1280px, `<MobileShell />` renders a bottom tab bar with a single-panel view. It has 5 tabs (Files, Editor, Terminal, Claude, Preview) and `useLayoutStore.mobileActivePanel` tracks the active tab.

**SSR/CSR mount gate**: `AppShell` returns a placeholder (`<div className="h-screen w-screen bg-background" />`) on the first render and mounts the real tree (`<Header />`, `<SplitLayoutRenderer />`, modal hosts) only after a `useEffect` flips `mounted=true`. This is necessary because `useSplitLayoutStore` and `useLayoutStore` (both `persist`) plus `useMediaQuery` use default state / desktop-true on the server but the localStorage-restored tree / actual viewport on the client. When the two trees differ in shape, `useId()` counters drift, causing Radix DropdownMenu trigger IDs (`radix-_R_*`) and `react-resizable-panels` PanelGroup registration IDs to mismatch between SSR and CSR — surfacing as hydration warnings together with `No group found for id "..."` assertions. With the gate, server and client first renders are identical (the placeholder), and the real tree mounts only on the client where ID generation is consistent.

**New files**:
- `src/hooks/use-media-query.ts` — `useMediaQuery` hook. Tracks viewport changes via `window.matchMedia` listener. Returns `true` (desktop-first) during SSR.
- `src/components/layout/mobile-shell.tsx` — Mobile tab layout. Switches between 5 `PanelId` tabs via a bottom tab bar.

### Dynamic Panel Splitting System (FR-108, FR-109)

The desktop layout uses a **recursive split tree** (`SplitNode` / `LeafNode`) instead of a hardcoded `PanelGroup` tree. `useSplitLayoutStore` manages the tree structure, and `SplitLayoutRenderer` recursively renders the tree into `react-resizable-panels` `PanelGroup` / `Panel` components.

```
SplitLayoutRenderer(node)
├── SplitNode → <PanelGroup direction={direction}>
│   ├── <Panel>{SplitLayoutRenderer(child[0])}</Panel>
│   ├── <PanelResizeHandle />
│   └── <Panel>{SplitLayoutRenderer(child[1])}</Panel>
│
└── LeafNode → <Panel collapsible>
        <LeafPanel panelType={type} leafId={id} />
    </Panel>
```

**Tab drag-and-drop**: uses `@dnd-kit/core` + `@dnd-kit/sortable` for tab reordering and split creation. `DndProvider` wraps the desktop layout, and each tab bar is wrapped in a `SortableContext`. Drop zones divide the panel area into 25% edges (top/bottom/left/right) and a 50% center, with `DropZoneOverlay` providing visual feedback.

**New files**:
- `src/stores/use-split-layout-store.ts` — Split tree state management. `splitLeaf`, `removeLeaf`, `updateRatio`, per-panel-type collapse control.
- `src/components/layout/split-layout-renderer.tsx` — Recursive layout renderer.
- `src/components/layout/leaf-panel.tsx` — Routes leaf nodes to their respective panel components.
- `src/components/dnd/dnd-provider.tsx` — `DndContext` wrapper. Handles tab reordering and split creation.
- `src/components/dnd/sortable-tab-item.tsx` — `useSortable`-based individual tab wrapper.
- `src/components/dnd/drop-zone-overlay.tsx` — Visual drop zone highlights during drag.
- `src/hooks/use-drop-zones.ts` — Utility to map pointer coordinates to 5 drop zones.

## 2.2 Server Component Structure

```
server.js
├── createServer(http)
│   ├── Next.js Request Handler          ← HTTP request handling
│   │   ├── SSR pages
│   │   └── /api/* (REST endpoints)
│   │       ├── /api/files/*
│   │       └── /api/sessions/*
│   │
│   └── WebSocket Upgrade Handler
│       ├── /_next/webpack-hmr          → Next.js HMR (dev only)
│       ├── /ws/terminal?browserId=     → PTY Session Handler (per-tab root via BrowserSessionRegistry)
│       ├── /ws/claude?browserId=       → Agent SDK Handler (per-tab root via BrowserSessionRegistry)
│       └── /ws/files?browserId=        → File Watcher Broadcaster (ref-counted per root)
│
└── lib/
    ├── project/                        ← Project context
    │   ├── project-context.mjs         (global singleton, ADR-016)
    │   └── browser-session-registry.mjs (per-tab roots, ADR-027)
    ├── fs/                             ← Sandboxed file system
    │   ├── resolve-safe.ts
    │   ├── file-operations.ts
    │   └── watcher.ts                  (@parcel/watcher)
    ├── claude/                         ← Agent SDK wrapper
    │   ├── session-manager.ts
    │   ├── query-handler.ts
    │   └── permission-interceptor.ts
    └── pty/                            ← PTY management
        ├── session-manager.ts
        └── pty-bridge.ts
```

## 2.3 FileExplorer Component

### File structure

```
src/components/panels/file-explorer/
├── file-explorer-panel.tsx         # container (FR-208 upload, mounts keyboard hook)
├── file-tree.tsx                   # react-arborist wrapper + inline-edit renderer
├── file-context-menu.tsx           # hoisted single context menu (FR-206)
├── delete-confirm-dialog.tsx       # delete confirmation dialog (FR-202)
├── use-file-actions.ts             # CRUD/clipboard action hook
├── use-file-keyboard.ts            # tree-scoped keyboard shortcuts (FR-212)
├── use-file-tree.ts                # data-loading hook
├── use-files-websocket.ts          # /ws/files subscription
├── file-icon.tsx                   # icon by extension
├── git-status-indicator.tsx        # Git status badge
└── use-git-status.ts               # Git status map fetch
```

Related global stores:
- `src/stores/use-file-context-menu-store.ts` — context-menu state (`{ open, anchor, target, selectionPaths, scope }`)
- `src/stores/use-file-clipboard-store.ts` — in-app clipboard (`{ paths, mode }`, FR-211)

### Key behavior

1. **Data loading**: the `useFileTree` hook calls `/api/files?path=<root>` to build the tree nodes.
2. **Virtualization**: `react-arborist`'s built-in virtual scrolling.
3. **Git status**: call `/api/git/status` to build a per-file status map → overlay. `useGitStatus` uses a single module-level cache + single-flight + **1500 ms debounce** to absorb `/ws/files` event bursts (HMR, `tsc --watch`, large git checkouts). Any extra events fired during an in-flight request collapse into a single trailing refresh.
4. **Live updates**: receive `/ws/files` WebSocket events to update tree nodes (debounced + rAF batched).
5. **Context menu (FR-206)**: the node renderer does **not** carry its own `<ContextMenu>`. Instead its `onContextMenu` calls `useFileContextMenuStore.openAtNode()` with the click coordinates, target node, and current selection paths. A single `<FileContextMenu>` mounted at the panel root opens a Radix DropdownMenu via a controlled `open` prop and an invisible fixed-position trigger that is repositioned at the click coordinates. Because the menu lives outside the virtualized list, react-arborist's row reconciliation and per-node hover re-renders cannot affect menu state — fixing the known dismissal glitch where moving the mouse after right-clicking would close the menu. Dismissal happens through exactly three paths: `Esc`, click outside the menu, or right-clicking another node.
6. **Selection model (FR-210)**: react-arborist's built-in selection is used. `Tree.onSelect` emits the selected node array; the panel container holds it in `selection`/`selectionRef` state and feeds it to the keyboard hook and the context menu.
7. **Inline editing (FR-202)**: when `node.isEditing` is true the node renderer renders an `<input>` and triggers `node.submit()` / `node.reset()` from `Enter`/`Esc`/`onBlur`. New file/folder creation uses a placeholder name (suffixed ` 2`, ` 3`, … on collision) created immediately by the panel, which then calls `treeRef.beginRename(path)` to enter inline edit mode.
8. **In-app clipboard (FR-211) and keyboard shortcuts (FR-212)**: `useFileActions` collects copy/cut/paste/duplicate/delete in one place. `useFileKeyboard` activates only when focus is inside the `data-file-explorer-panel="true"` container and maps the actions plus tree helpers (`tree.selectAll`, `tree.deselectAll`, `tree.edit(id)`) onto key presses. Cut nodes are rendered with `italic + opacity-50`.
9. **Intra-tree drag move/copy (FR-203)**: react-arborist's `onMove` is wired up. The native `dragstart`/`dragover` events capture `altKey` into a ref so the move handler can branch between move (`filesApi.rename`) and Alt-copy (`filesApi.copy`). Moving into self/descendants is rejected.
10. **Delete confirmation (FR-202)**: `useDeleteConfirmStore.request(paths)` exposes a Promise-based async-prompt pattern, and a `<DeleteConfirmDialog>` mounted at the panel root surfaces the modal (with the affected path list when multi-selected).
11. **OS file drop / paste upload (FR-208)**: the `FileExplorerPanel` root `div` is `tabIndex={0}` and wires `onDragEnter/onDragOver/onDragLeave/onDrop` plus `onPaste`. Only drags whose `e.dataTransfer.types` include `'Files'` are accepted, so the handler does not conflict with react-arborist's internal node drags. `File[]` collected from drop or paste events is sent via `filesApi.upload(destDir, files)` to `POST /api/files/upload`, and on success `refreshRoot()` refreshes the tree immediately. While dragging, the panel shows a `ring-2 ring-primary` border together with a "Drop files to upload to project root" overlay.

## 2.4 EditorPanel Component

### File structure

```
src/components/panels/editor/
├── editor-panel.tsx                # container (header bar + tab bar + editor)
├── editor-tab-bar.tsx              # tab list
├── editor-settings-dropdown.tsx    # editor settings dropdown (gear icon)
├── monaco-editor-wrapper.tsx       # Monaco wrapper (extended options + cursor tracking)
├── claude-completion-provider.ts   # Claude AI inline completion provider
├── diff-accept-bar.tsx             # AI diff accept/reject UI
src/lib/editor/
└── language-map.ts                 # file extension → language mapping utility
```

### State management

```typescript
// useEditorStore (Zustand)
interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  cursorLine: number | null;        // current cursor line
  cursorCol: number | null;         // current cursor column
  completionLoading: boolean;       // AI completion in progress
  openFile(path: string): void;
  closeTab(id: string): void;
  setActiveTab(id: string): void;
  setCursorPosition(line: number, col: number): void;
  setCompletionLoading(loading: boolean): void;
  applyClaudeEdit(path: string, modified: string): void;
}

interface EditorTab {
  id: string;
  path: string;
  content: string;
  originalContent: string;
  dirty: boolean;
  locked: boolean;     // while Claude is editing
  diff?: DiffState;    // pending AI changes
}

// useSettingsStore (Zustand, persist)
// Editor-related settings:
//   editorWordWrap, editorTabSize, editorUseSpaces,
//   editorMinimapEnabled, editorRenderWhitespace,
//   editorStickyScroll, editorBracketColors,
//   editorCompletionEnabled, editorCompletionDelay
```

### Model management

- A dedicated Monaco model is created per file (`monaco.editor.createModel`).
- On tab close, `dispose()` is called on the model (to prevent leaks).
- Switching tabs only swaps the model on the editor instance → cursor/scroll/undo are preserved automatically.

### AI inline completion

- `claude-completion-provider.ts` registers a Monaco `InlineCompletionsProvider`
- After typing stops, debounce (500ms) → WebSocket `completion_request` sent
- Server-side (`claude-handler.mjs`) calls Agent SDK `query()` with `maxTurns: 1`
- Response displayed as ghost text, accepted with Tab
- `AbortController` auto-cancels previous requests
- Cursor context window (100 lines before / 30 lines after) handles large files

### AI diff handling

```typescript
// diff.status: 'pending' | 'streaming'
// 'streaming' — Claude is still streaming tool input (Accept/Reject disabled)
// 'pending'  — tool execution complete, awaiting user approval

// When Claude executes Write/Edit/MultiEdit (auto-wired from use-claude-store.ts)
// 1. input_json_delta streaming → updateStreamingEdit(path, partial) → status:'streaming'
// 2. content_block_stop → applyClaudeEdit(path, final) → status:'pending'

function applyClaudeEdit(path: string, newContent: string) {
  const tab = findTab(path);
  const original = tab.diff?.original ?? tab.content; // preserve streaming baseline
  tab.diff = {
    original,
    modified: newContent,
    status: 'pending',
    hunks: computeHunks(original, newContent),
    acceptedHunkIds: allHunkIds,
  };
  tab.locked = true;
}

function updateStreamingEdit(path: string, partialContent: string) {
  // Same as applyClaudeEdit but sets status:'streaming'
}

// syncExternalChange guard: skip when tab.diff is set
function syncExternalChange(path: string) {
  const tab = findTab(path);
  if (tab.diff) return; // Claude diff is showing — do not overwrite
  // ... existing logic
}
```

### Auto panel expansion

- When Claude edits a file and the editor panel is collapsed, it is automatically expanded.
- For HTML/SVG/MD files, the preview panel is also auto-expanded.
- The `forwardToolToEditor()` helper calls `useLayoutStore.setCollapsed()`.

### Streaming activity display

- A `StreamingActivityBar` is added to the chat panel showing the file currently being edited.
- The DiffAcceptBar now shows a shimmer progress bar and "Claude is editing..." indicator during streaming.

## 2.5 TerminalPanel Component

### Design overview

`TerminalPanel` follows a **thin-attach pattern** so that React's lifecycle cannot touch PTY processes. Both the xterm.js `Terminal` instance and the WebSocket connection are owned by a `TerminalManager` singleton that lives outside the component tree; React components merely supply a DOM host.

- **Owner**: `TerminalRegistry` singleton (`src/lib/terminal/terminal-registry.ts`) + 4 separated modules (`terminal-instance.ts`, `terminal-connection.ts`, `terminal-session-controller.ts`). See `terminal-v2-design.md` for details
- **Attach point**: `XTerminalAttach` (`src/components/panels/terminal/x-terminal.tsx`) — the host div is wrapped in a Radix `ContextMenu`. Its `<div>` background is bound to `style={{ background: 'var(--terminal-bg)' }}` so theme toggles, tab switches, and first-mount never flash black (FR-419).
- **Container + tab UI**: `TerminalPanel` (`src/components/panels/terminal/terminal-panel.tsx`) — inline rename, cwd label, unread indicator, project-change banner, Restart chip, split-pane renderer, "Open in system terminal" `ExternalLink` button (`FR-420`)
- **Search overlay**: `TerminalSearchOverlay` (`src/components/panels/terminal/terminal-search-overlay.tsx`)
- **Theme palette**: `src/lib/terminal/terminal-themes.ts` (`TERMINAL_THEMES`) — single source of truth. Exports `ConcreteTheme` (all themes except `'system'`) and `resolveTheme()`. `resolveTheme(theme)` evaluates `window.matchMedia('(prefers-color-scheme: dark)')` when the input is `'system'` and returns `'dark'`/`'light'`; otherwise it passes the theme through unchanged. `TerminalManager` imports and propagates it via `setTheme`. The hex values must stay in parity with `--terminal-bg`/`--terminal-fg` in `globals.css`; `tests/unit/terminal-themes-contrast.test.ts` catches drift.
- **State**: `useTerminalStore` (`src/stores/use-terminal-store.ts`) — tab list, active session ID, session status (`connecting` / `open` / `closed` / `exited`), cwd, displayName, unread, searchOverlayOpen, splitEnabled, primarySessionId, secondarySessionId, activePaneIndex
- **Connection manager**: `src/lib/terminal/terminal-connection.ts` (`TerminalConnection`) — auto-reconnect with exponential backoff (5 attempts) + input queue + backpressure. Carries `serverSessionId` via URL to reattach to existing PTY (FR-414).
- **Server-side session registry**: `server-handlers/terminal/session-registry.mjs` (`TerminalSessionRegistry` singleton) — manages PTY lifetime, 256 KB ring buffer, 30-minute GC, and transient/exit listener fan-out. ADR-020.
- **Shell resolver**: `server-handlers/terminal/shell-resolver.mjs` (`resolveShell`, `shellFlags`, `buildPtyEnv`)
- **OS terminal bypass**: `src/app/api/terminal/open-native/route.ts` (POST endpoint), `src/app/api/terminal/open-native/launchers.ts` (`resolveLauncher` pure function with a per-platform command table), `terminalApi.openNative` client wrapper, and the `Cmd/Ctrl+Shift+O` global shortcut. See `FR-420`.
- **File explorer integration**: `src/app/api/files/reveal/route.ts` (Reveal in Finder/Explorer), `filesApi.reveal`, and the `file-tree.tsx` context menu's `Open terminal here` (WS URL `?cwd=<path>`) and `Open in system terminal` (FR-420).
- **Editor integration**: the module-level `activeMonacoEditor` reference and `getActiveEditorSelectionOrLine()` in `src/components/panels/editor/monaco-editor-wrapper.tsx`, and `useEditorStore.pendingReveal` (consumed by the link provider via `revealLineInCenter`)
- **Framing helpers**: `src/lib/terminal/terminal-framing.ts` — now includes `TerminalCloseControl` (client → server) and `TerminalSessionServerControl` (server → client)

The manager emits two event streams:
- `SessionListener` — status/exitCode changes
- `CwdListener` — OSC 7 cwd updates

The store subscribes to each and reflects them in the tab labels, status indicators, and cwd suffixes.

### TerminalManager lifecycle

| Event | Behavior |
|---|---|
| App boot (`app-shell.tsx`) | `terminalManager.boot()` is called once. It subscribes to `useLayoutStore.fontSize`, registers a reserved-key predicate (`Cmd+T/W/F/K`, `Cmd+Shift+R`, `Ctrl+Tab`, `Cmd+1..9`) consumed by `attachCustomKeyEventHandler`, and installs an HMR hot-dispose hook. |
| Session creation | Store `createSession` → `terminalManager.ensureSession(id)`. xterm is constructed (the `SearchAddon` instance is kept on the `TerminalInstance`, and an OSC 7 handler is registered via `term.parser.registerOscHandler(7, …)`); a `TerminalSocket` is opened (PTY spawns here). `term.open()` is deferred. |
| Socket open | The `createSocket` `onOpen` callback sends an initial `resize` frame. The OSC 7 emitter snippet is injected server-side immediately after PTY spawn, so no client-side action is needed here. |
| React attach | `XTerminalAttach`'s `useEffect` → `terminalManager.attach(id, host)`. The manager appends its persistent `<div>` into `host`, calls `term.open()` on first attach only, waits for a non-zero rect with `requestAnimationFrame`, runs `fit()`, sends a resize frame, and calls `focus()`. The WebGL addon is lazy-loaded at this point. |
| Tab switch | Store `setActiveSession` → `terminalManager.activate(id)` → `fit()` + `focus()`. `searchOverlayOpen` is reset to false. |
| Font-size change | Manager subscription callback → `setFontSize(px)` → sets `term.options.fontSize` and re-fits every instance. No PTY restart. |
| Panel collapse | `<TerminalPanel>` unmounts → `XTerminalAttach.useEffect` cleanup → `terminalManager.detach(id)`. The manager unparents its persistent `<div>` but keeps xterm and the WS alive. |
| Socket error | The `createSocket` `onError` callback logs a warning to the console. If a server `error` control frame is received while the session is still `connecting`, it immediately transitions to `closed`. |
| Connection timeout | If the WebSocket handshake exceeds 15 seconds, a timer in the `connectTimers` map transitions the session to `closed` and closes the socket. The timer is cleared in `onOpen`/`onClose`. |
| Unexpected socket close | The `createSocket` `onClose` callback transitions status to `closed` and writes `[connection to PTY lost]` to the xterm buffer. **No reconnect attempt**. |
| Shell exit | Server sends `{type:"exit", code}` control frame → `applyServerControl` transitions status to `exited`. The tab remains until the user closes it. |
| Restart | `restartSession(id)` — permitted only when `closed`/`exited`. Keeps the xterm buffer (no `dispose`), inserts a `─── restarted at HH:MM:SS ───` separator, resets `pendingBytes`/`paused`/`exitCode`, sets status `connecting`, and calls `createSocket(inst)` again. The OSC 7 snippet is automatically re-injected server-side when the new PTY is spawned. |
| Tab close | Store `closeSession(id)` → `terminalManager.closeSession(id)` → ws.close (server kills PTY). Then `term.dispose()` and removal from the map. |

### Addon setup

xterm.js and every addon are loaded via dynamic `import()` for SSR safety.

```typescript
const [{ Terminal }, { FitAddon }, webgl, { SearchAddon }, { WebLinksAddon }] = await Promise.all([
  import('@xterm/xterm'),
  import('@xterm/addon-fit'),
  import('@xterm/addon-webgl').catch(() => null),
  import('@xterm/addon-search'),
  import('@xterm/addon-web-links'),
]);

const term = new Terminal({
  cursorBlink: true,
  scrollback: 10000,
  fontFamily: 'JetBrains Mono, Menlo, monospace',
  fontSize,
  theme: { background: '#0a0a0a' },
  allowProposedApi: true,
});
term.loadAddon(new FitAddon());
term.loadAddon(new SearchAddon());
term.loadAddon(new WebLinksAddon());
// The WebGL addon is loaded lazily on first attach, once the canvas exists.
```

### Framing and backpressure

- **PTY data**: the server sends **binary** WebSocket frames → the client dispatches by `typeof event.data`. `term.write(Uint8Array)` decodes UTF-8 internally.
- **Control messages**: **text JSON** frames in both directions. `parseServerControlFrame` recognises only `exit` / `error` as control; any other text is treated as PTY output for resilience.
- **Client backpressure**: 100 KB high / 10 KB low watermarks drive `pause` / `resume` control frames to the server.
- **Server backpressure**: while `paused`, data is buffered (never dropped). When the queue exceeds 256 KB the server calls `ptyProcess.pause()` to stop the upstream shell; beyond 5 MB it emits a `BUFFER_OVERFLOW` error frame, kills the PTY, and closes the WebSocket with code 1011.

### Resize sync

The manager calls `fitAddon.fit()` on first attach, tab activation, panel re-expand, and font-size change. PTYs are spawned at a default 120×30 which the first `fit()` overrides. A `{type:'resize', cols, rows}` control frame is sent only when the resulting dimensions differ from the previous send.

### Shell initialization and environment (FR-410)

Before spawning the PTY, the server calls three helpers from `server-handlers/terminal/shell-resolver.mjs` in order:

1. `resolveShell(env, platform)` — resolves the shell in the order `CLAUDEGUI_SHELL` → `$SHELL`/`$COMSPEC` → platform defaults.
2. `shellFlags(shellPath)` — returns `['-l','-i']` for `zsh`/`bash`/`fish`/`sh` family shells, `['-NoLogo']` for `pwsh`/`powershell`, and `[]` for `cmd`. This is what makes the user's dotfiles run, so PATH, aliases, and prompts come alive.
3. `buildPtyEnv(shellPath, baseEnv, platform)` — adds `TERM`, `COLORTERM`, `TERM_PROGRAM`, `TERM_PROGRAM_VERSION`, `CLAUDEGUI_PTY`, `CLAUDEGUI_SHELL_PATH` and defensively strips Next.js server-only variables (`NODE_OPTIONS`, `ELECTRON_RUN_AS_NODE`, `NEXT_TELEMETRY_DISABLED`, `__NEXT_PRIVATE_*`).

The terminal handler then forwards the returned `{ shell, args, env }` together with ProjectContext's active root (`getActiveRoot()`) to `pty.spawn`. Per-session cwd is subsequently tracked through the OSC 7 pathway.

### Keyboard arbitration (FR-806)

Terminal shortcuts use a **hybrid routing** pattern:

- `TerminalManager` installs an xterm `attachCustomKeyEventHandler` that returns `false` for reserved combinations so xterm never writes them to the PTY.
- The same combinations are observed by a window-level keydown listener in `src/hooks/use-global-shortcuts.ts`, which dispatches `useTerminalStore` actions (createSession, closeActiveSession, toggleSearchOverlay, clearActiveBuffer, restartActiveSession, next/prev/activateTabByIndex) only when `isFocusInsideTerminal()` returns true.
- `isFocusInsideTerminal()` walks up from `document.activeElement` via `closest('[data-terminal-panel="true"]')`. xterm routes input through a hidden textarea, so this scoping is stable.
- `Cmd+K` arbitration: when focus is inside the terminal, the Command Palette (`FR-801`) `Cmd+K` handler early-returns. Elsewhere the palette opens as before.

### Per-panel zoom (FR-807)

Each panel stores an independent zoom multiplier (`panelZoom: Record<PanelId, number>`) in `useLayoutStore`. Focus tracking is implemented via the `usePanelFocus` hook (`src/hooks/use-panel-focus.ts`), which returns `onMouseDown`/`onFocus` handlers bound to each panel's root `<div>`.

**Zoom application**:
- Editor/Terminal: `fontSize × panelZoom[panel]` is passed to Monaco/xterm `fontSize` option. `TerminalManager` subscribes to `panelZoom.terminal` changes in its `useLayoutStore.subscribe` callback.
- File explorer / Claude chat / Preview: CSS `zoom` property is conditionally applied to the content area (only when `zoom !== 1`).

**UI controls**: `PanelZoomControls` component (`src/components/panels/panel-zoom-controls.tsx`) renders `−` / percentage / `+` buttons in each panel header. `onMouseDown` stopPropagation prevents zoom-button clicks from changing focused panel.

**Shortcuts**: `Cmd+Shift+=`/`-`/`0` (macOS) · `Ctrl+Shift+=`/`-`/`0` (other) zoom in / out / reset the focused panel. Registered in `use-global-shortcuts.ts`.

### Search overlay (FR-405)

The `TerminalInstance` retains its `searchAddon` so `findNext`, `findPrevious`, and `clearDecorations` can be exposed as public manager methods. `TerminalSearchOverlay` owns its toggle state (match case / whole word / regex) and a 100 ms debounced incremental search. On close, it clears decorations and returns focus to xterm via `terminalManager.activate(id)`.

## 2.6 PreviewPanel Component

### File structure

```
src/components/panels/preview/
├── preview-panel.tsx               # container + header (source/rendered toggle, download)
├── preview-router.tsx              # renderer dispatch + viewMode branching
├── html-preview.tsx                # iframe srcdoc
├── html-editor.tsx                 # split-view HTML editor (FR-616)
├── pdf-preview.tsx                 # react-pdf
├── markdown-preview.tsx            # react-markdown
├── markdown-editor.tsx             # split-view Markdown editor (FR-616)
├── image-preview.tsx               # zoom/pan
├── slide-preview.tsx               # multi-page vertical scroll + selection + Edit mode
├── source-preview.tsx              # highlight.js-backed source view (FR-614)
├── live-html-preview.tsx           # streaming-only path
└── preview-download-menu.tsx       # one-click download dropdown
```

Beyond `currentFile`/`pageNumber`/`zoom`/`fullscreen`, `usePreviewStore` carries a `viewMode: 'rendered' | 'source'` field (FR-614). The default is `'rendered'`, and calling `setFile` resets `viewMode` to `'rendered'` so the source view never sticks across file switches. An `isSourceToggleable(type)` helper only allows the toggle for `html`/`markdown`/`slides`. The `renderedHtml: string | null` field (FR-613) caches rendered HTML from file-backed preview components (docx/xlsx/pptx/image), enabling cross-format export (PDF/HTML/Doc). It is reset to `null` on `setFile`.

For slide editing, `slideEditMode: boolean` and `selectedSlideIndex: number` (0-based) fields have been added (FR-702, FR-703). Both are reset (`false`, `0`) on `setFile` calls. The Edit toggle button is displayed in the header only when `type === 'slides' && viewMode !== 'source'`.

For HTML/Markdown direct editing, an `editMode: boolean` field has been added (FR-616). It is reset to `false` on `setFile` calls. The Edit toggle button is displayed in the header when `type === 'html' || type === 'markdown'` and `viewMode !== 'source'`. In edit mode, a split view (left: textarea code editor, right: live preview) is provided with 1-second debounced auto-save that syncs to both the editor tab and disk.

### Router logic

```typescript
function PreviewRouter({ filePath, content }: Props) {
  const viewMode = usePreviewStore((s) => s.viewMode); // 'rendered' | 'source'
  const type = detectPreviewType(filePath);

  // Unsupported type or no selection → fully blank surface (FR-601)
  if (!filePath || type === 'none') return <div className="h-full w-full" aria-hidden />;

  // Text-backed types branch into the syntax-highlighted source view when
  // viewMode === 'source' (FR-614)
  if (type === 'html')
    return viewMode === 'source'
      ? <SourcePreview content={content} language="html" />
      : <HTMLPreview content={content} />;
  if (type === 'markdown')
    return viewMode === 'source'
      ? <SourcePreview content={content} language="markdown" />
      : <MarkdownPreview content={content} />;
  if (type === 'slides')
    return viewMode === 'source'
      ? <SourcePreview content={content} language="html" />
      : <SlidePreview content={content} onContentChange={handleSlideContentChange} />;

  // Binary / render-only types
  if (type === 'pdf') return <PDFPreview path={filePath} />;
  if (type === 'image') return <ImagePreview path={filePath} />;
  if (type === 'docx') return <DocxPreview path={filePath} />;
  if (type === 'xlsx') return <XlsxPreview path={filePath} />;
  if (type === 'pptx') return <PptxPreview path={filePath} />;
  return null;
}
```

### HTMLPreview implementation

```typescript
function HTMLPreview({ content }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debouncedContent = useDebounce(content, 300);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={debouncedContent}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="w-full h-full border-0"
    />
  );
}
```

### SlidePreview implementation (multi-page vertical scroll + Edit mode)

```typescript
// 1. Parse <section> elements from HTML into individual slide array
const sections = parseSections(content); // string[]

// 2. Render each slide as a card (vertical scroll, click to select)
sections.map((sec, i) => (
  <SlideCard
    sectionHtml={sec}
    index={i}
    isSelected={i === selectedSlideIndex}
    onSelect={handleSelect}
  />
));

// 3. When Edit mode is active, show SlideEditor
// - Prompt input → getClaudeClient().sendQuery(instruction)
// - HTML code editing (<textarea>) + Cmd+S to save
// - Live preview (iframe srcDoc)
// - Save → reconstructHtml(original, updatedSections) → onContentChange
```

`SlideCard` renders each `<section>` as a scaled-down iframe with reveal.js CSS applied, with `border-primary` highlight based on selection state. `SlideEditor` provides a three-part layout: prompt input, HTML code editor, and live preview. On save, `reconstructHtml` reassembles the original HTML and synchronizes it to both the editor tab and disk.

// Inside reveal-host.html
window.addEventListener('message', (e) => {
  if (e.data.type === 'UPDATE_SLIDE') {
    updateSlideDOM(e.data.slides);
    Reveal.sync();
  }
});
```

### Contain-fit rendering and content outline (FR-612)

The preview panel guarantees that the entire content layout is visible regardless of the container's aspect ratio, and that the content boundary is always discernible even when background colours collide. The rules below apply identically regardless of `usePreviewStore.fullscreen`.

- **Slides (`reveal-host.html`)**: `Reveal.initialize` is called with a fixed logical size (`width: 960, height: 700`) plus `margin: 0.04`, `minScale: 0.05`, and `maxScale: 2.0`, so a full slide always fits the viewport at any aspect ratio. `.reveal .slides > section` draws its outline with `box-shadow: 0 0 0 1px rgba(255,255,255,0.28), 0 6px 24px rgba(0,0,0,0.45)`.
- **PDF (`pdf-preview.tsx`)**: a `ResizeObserver` watches the scroll container, and the first page's `onLoadSuccess` captures the native size via `getViewport({ scale: 1 })`. `Page` is then rendered with `width = min(availableWidth, availableHeight × aspect)` so the whole page fits the container. The page canvas is wrapped in a `ring-1 ring-border/70 shadow-md` box. The cached native size is reset whenever the file path changes.
- **HTML / Live HTML / Markdown**: the content surface is wrapped in a `bg-muted` outer box with an inner `ring-1 ring-border/70 shadow-sm`, so it is visually separated from the surrounding UI.

### Source/rendered view toggle (FR-614)

Text-backed formats (`html`/`markdown`/`slides`) can flip between the rendered view and the source view through a `Code`/`Eye` toggle button in the preview panel header. The button lives in the `preview-panel.tsx` header row (to the left of the download menu) and is only shown when `!showLive && isSourceToggleable(type)`. While the live HTML stream is active, `live-html-preview.tsx`'s existing internal toggle remains authoritative and the header toggle stays hidden (the two paths are mutually exclusive).

The source view (`source-preview.tsx`) registers only `xml` (HTML) and `markdown` on `highlight.js/lib/core` and injects the result of `hljs.highlight()` into a `<pre><code class="hljs language-...">` block. The theme CSS (`highlight.js/styles/github-dark.css`) is imported once from `src/app/layout.tsx`, and the outer container reuses the FR-612 outline rules (`bg-muted` + `ring-1 ring-border/70 shadow-sm`).

### One-click preview download (FR-613)

The preview panel header exposes a download dropdown that immediately downloads the currently rendered content in any of the formats appropriate for the active preview type. The menu stays active during live preview as well, treating the streamed buffer (or the synchronized editor tab content) as an inline HTML artifact and downloading it on the spot.

- **Adapter** (`src/lib/preview/preview-download.ts`): converts `(filePath, type, content, renderedHtml?)` into the `ExtractedArtifact` shape defined in `src/lib/claude/artifact-extractor.ts`. Text previews (`html`/`markdown`/`slides`, and `.svg` images) are built with `source: 'inline'`; binary previews (`pdf`/`image` except SVG/`docx`/`xlsx`/`pptx`) are built with `source: 'file'` + `filePath`. The adapter then delegates to `availableExports()` / `exportArtifact()` from `src/lib/claude/artifact-export.ts`, reusing the existing download / print pipeline as-is. When `renderedHtml` is present, the adapter routes cross-format exports (PDF/HTML/Doc) through `exportWithRenderedHtml()`.
- **Rendered HTML cache** (`usePreviewStore.renderedHtml`): Preview components (docx/xlsx/pptx/image) publish their rendered HTML to the store when they mount. The cache is automatically cleared to `null` when the file changes (`setFile`). When this cache exists, `availableExports(artifact, true)` returns PDF/HTML/Doc options in addition to "Original file".
- **PDF direct print** (`printPdfDirect()`): For PDF files, the original bytes are loaded into a hidden iframe and `contentWindow.print()` is invoked to open the browser print dialog directly. The PDF export options dialog (`PdfExportDialog`) is skipped.
- **Header component** (`src/components/panels/preview/preview-download-menu.tsx`) resolves the download source with the following precedence:
  1. **Live mode first (`showingLive`)**: when `useLivePreviewStore.autoSwitch && mode !== 'idle'`, the input becomes `filePath = generatedFilePath ?? 'live-preview.html'`, `type = 'html'`, and `content = (editorTab[generatedFilePath]?.content) ?? buffer`. If the buffer is empty the menu does not render.
  2. **Regular file preview**: the `PreviewType` is derived from `usePreviewStore.currentFile` (or the editor store's active tab path). Text-backed types (`html`/`markdown`/`slides` + `.svg`) first try the in-memory editor tab and lazy-load via `filesApi.read()` on click if needed. File-backed binary types require no content but pass `usePreviewStore.renderedHtml` to enable cross-format export.
  3. The resolved input is passed to `previewDownloadOptions(input)` → `downloadPreview(input, format)`.
- **Live streaming caption**: while `mode === 'live-code'` (partial chunk, not yet a renderable unit) the dropdown header reads `Download (streaming…)`; once `mode === 'live-html'` it reads `Download live buffer`; outside of live mode it reads `Download as`. This tells the user which snapshot they are capturing. Because `html-stream-extractor.ts` maintains the accumulated full document (previously-generated pages + the currently-streaming tail), downloading at any point during a 5-page stream captures everything rendered up to that moment.
- **Panel placement** (`src/components/panels/preview/preview-panel.tsx`): `PreviewDownloadMenu` is placed immediately to the left of the fullscreen toggle in the header and is rendered regardless of `showLive`.
- **Format matrix** follows the table in FR-613. PDF export routes through the browser print dialog, letting the OS "Save as PDF" handle the write, so no server-side PDF renderer (Puppeteer, etc.) is required.

## 2.7 ClaudeIntegration Module

### Server-side structure

```
src/lib/claude/
├── session-manager.ts              # create/resume/fork sessions
├── query-handler.ts                # wrapper around Agent SDK query()
├── permission-interceptor.ts       # tool-permission handling
├── stream-parser.ts                # NDJSON event parsing
└── cost-tracker.ts                 # cost/token accumulation
```

### query-handler.ts example

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

export async function* handleQuery({
  prompt,
  sessionId,
  cwd,
  options,
}: QueryParams) {
  const stream = query({
    prompt,
    sessionId,
    cwd,
    ...options,
  });

  for await (const message of stream) {
    switch (message.type) {
      case 'assistant':
      case 'stream_event':
        yield { type: 'message', data: message };
        break;

      case 'tool_use':
        if (requiresPermission(message.tool)) {
          const approved = await requestPermission(message);
          if (!approved) {
            yield { type: 'error', message: 'Permission denied' };
            return;
          }
        }
        yield { type: 'tool_call', data: message };
        break;

      case 'result':
        yield { type: 'result', data: message };
        break;
    }
  }
}
```

### ClaudeChatPanel — prompt @ mentions (FR-511)

The input area in `src/components/panels/claude/claude-chat-panel.tsx` supports `@` autocomplete. On every user keystroke, `detectMention(value, cursor)` (`use-file-mentions.ts`) checks whether an `@` token sits immediately before the cursor. A literal `@` is only treated as a mention when it is at the start of the text or preceded by whitespace, so email-like strings are not misdetected.

Candidates are collected by `listProjectFiles()` (`src/lib/fs/list-project-files.ts`), which recursively walks `GET /api/files` up to depth 3 and includes both files and directories. The `useFileMentions` hook re-crawls whenever `useProjectStore.activeRoot` changes. Filtering is done by the pure `filterMentionCandidates()` function with the ranking: exact match > full-path prefix > basename prefix > substring > subsequence, capped at 20 results.

The dropdown (`MentionPopover`) is placed `absolute bottom-full` inside a `relative` wrapper around the textarea, so it floats above the edit area. Keyboard handling (↑/↓/Enter/Tab/Escape) in `claude-chat-panel.tsx`'s `onKeyDown` intercepts those keys only while the mention popover is open; when it is closed, `Enter` continues to submit the message as before. Accepting a candidate replaces the `@<query>` token with `@<project-relative path>` (with a trailing `/` for directories) and moves the caret past the insertion point.

`@` references are forwarded to the Claude Agent SDK verbatim via `sendQuery(prompt)` — the GUI never expands the reference into file content itself. Reference resolution is delegated to the CLI / SDK's standard grammar.

### ClaudeChatPanel — File/Image Drag-and-Drop (FR-517)

The `useChatDrop` hook in `src/components/panels/claude/use-chat-drop.ts` manages drag-and-drop and clipboard paste for the Claude chat panel. It uses the shared utilities `collectFilesFromDataTransfer()` and `hasFilePayload()` from `src/lib/fs/collect-files.ts` to extract files from `DataTransfer` objects (the same utilities are shared with the file explorer panel).

When files are dropped, the hook calls `filesApi.mkdir('uploads')` → `filesApi.upload('uploads', files)` to save them to the project `uploads/` directory, then inserts the server-returned `writtenPath` values as `@{path}` references into the input field. For clipboard paste, images are uploaded with filenames in `paste-{timestamp}.{ext}` format to the same directory.

UI components:
- `DropOverlay` (`drop-overlay.tsx`): displays a semi-transparent overlay across the entire panel during drag to indicate the droppable area.
- `AttachedFilesBar` (`attached-files-bar.tsx`): shows uploaded/uploading files as chips above the input field; each chip includes a status icon (spinner/check/error) and a remove button.
- The send button is disabled while uploads are in progress, and all chips are cleared when the message is sent.

## 2.8 State Management (Zustand Stores)

### useLayoutStore

```typescript
type Theme = 'dark' | 'light' | 'high-contrast' | 'retro-green' | 'system';
type PanelId = 'fileExplorer' | 'editor' | 'terminal' | 'claude' | 'preview';

interface LayoutState {
  // panel sizes (%)
  fileExplorerSize: number;
  editorSize: number;
  terminalSize: number;
  previewSize: number;

  // collapsed state — all 5 panels are collapsible
  fileExplorerCollapsed: boolean;
  editorCollapsed: boolean;
  terminalCollapsed: boolean;
  claudeCollapsed: boolean;
  previewCollapsed: boolean;

  // theme — 'system' follows OS preference (prefers-color-scheme)
  theme: Theme;

  // mobile — active tab when viewport < 1280px
  mobileActivePanel: PanelId;

  // per-panel zoom (FR-807)
  focusedPanel: PanelId | null;  // currently focused panel (ephemeral, excluded from persist)
  panelZoom: Record<PanelId, number>;  // per-panel zoom multiplier (default 1.0, range 0.5–2.0)

  // actions
  setPanelSize(panel: string, size: number): void;
  togglePanel(panel: PanelId): void;
  setCollapsed(panel: PanelId, collapsed: boolean): void;
  resetPanelSizes(): void;
  setTheme(theme: Theme): void;
  setMobileActivePanel(panel: PanelId): void;
  setFocusedPanel(panel: PanelId | null): void;
  increasePanelZoom(panel: PanelId): void;
  decreasePanelZoom(panel: PanelId): void;
  resetPanelZoom(panel: PanelId): void;
}

// persist middleware applied (v4 migration: adds panelZoom, focusedPanel)
export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({ ... }),
    { name: 'claudegui-layout', version: 4 }
  )
);
```

### useEditorStore

```typescript
interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  openFile(path: string): Promise<void>;
  closeTab(id: string): void;
  setActiveTab(id: string): void;
  markDirty(id: string, dirty: boolean): void;
  applyClaudeEdit(path: string, edit: EditOperation): void;
  saveFile(id: string): Promise<void>;
}
```

### useTerminalStore

```typescript
interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  createSession(cwd?: string): string;
  closeSession(id: string): void;
  setActiveSession(id: string): void;
}
```

### useClaudeStore

```typescript
interface ClaudeTab {
  id: string;            // unique tab ID (UUID)
  name: string;          // display name (auto-named from first message)
  sessionId: string | null;  // null before the first message is sent
}

interface ClaudeTabState {
  messages: ClaudeMessage[];
  isStreaming: boolean;
  pendingPermissionRequest: PermissionRequest | null;
  sessionStats: SessionStats | null;
}

interface SessionStats {
  sessionId: string;
  model: string | null;
  numTurns: number | null;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  lastUpdated: number | null;
}

interface ClaudeState {
  // Multi-tab structure
  tabs: ClaudeTab[];                         // list of open tabs
  activeTabId: string;                       // currently active tab ID
  tabStates: Record<string, ClaudeTabState>; // tabId → per-tab state

  // Legacy compat (session list management)
  sessions: ClaudeSession[];
  totalCost: Record<string, number>;
  tokenUsage: Record<string, { input: number; output: number }>;

  sendQuery(prompt: string): Promise<void>;
  resumeSession(id: string): void;
  forkSession(id: string): string;
  respondToPermission(approved: boolean): void;

  // Tab management actions
  createTab(): string;
  closeTab(tabId: string): void;
  setActiveTab(tabId: string): void;
  renameTab(tabId: string, name: string): void;
}
```

The multi-tab refactor replaced the former flat state (`activeSessionId`, `messages: Record<string, ClaudeMessage[]>`) with a `tabs` + `tabStates` structure. Each tab owns an independent session and message list, and streaming responses are routed to the correct `ClaudeTabState` by `session_id`. New tabs are created with `sessionId: null`; the backend session is automatically created when the first message is sent.

`sessionStats` is accumulated only from values that the Agent SDK actually
sends: the `model` field from the `system.init` event, and `num_turns`,
`duration_ms`, `usage.*`, `total_cost_usd` from `result` events. Fields the
SDK does not provide remain `null` and are rendered as "-" in the UI. Values
such as the context window size are never hardcoded — only data present in
actual responses is exposed.

#### ModelSelector (Claude panel header)

`src/components/panels/claude/model-selector.tsx` provides a model selection
dropdown in the Claude chat panel header (FR-512).

- Reads the current model from `useSettingsStore.selectedModel` and updates
  it via `setSelectedModel`.
- The model list is sourced from the `MODEL_SPECS` constant in
  `src/lib/claude/model-specs.ts`.
- The selected model is persisted to `localStorage` via `useSettingsStore`'s
  `persist` middleware.
- On query send, `claude-client.ts`'s `sendQuery` reads `selectedModel` and
  includes it in `ClaudeQueryMessage.options.model`.
- Additionally, `sendQuery` reads active tab information from `useEditorStore` and includes it in `ClaudeQueryMessage.activeFile` (FR-518). The server side injects this information as a `[Active file: <path>, line <n>:<col>]` prefix into the prompt.
- Uses the shadcn/ui `DropdownMenu` component.

#### ChatFilterBar (Claude panel)

`src/components/panels/claude/chat-filter-bar.tsx` provides a `MessageKind`-based
filter toggle bar above the message area (FR-515).

- Text, Tools, Auto, and Errors categories each render as icon + label + count
  badge toggle buttons.
- State is managed via `useClaudeStore.messageFilter` (Set\<MessageKind\>) and
  the `toggleFilter` action.
- `claude-chat-panel.tsx` uses `useMemo` to filter:
  `messages.filter(m => messageFilter.has(m.kind))`, rendering only matching
  messages.
- **Performance**: Uses `useShallow` to derive kind-based counts instead of subscribing to the full `messages` array, preventing unnecessary re-renders during streaming.
- User messages (`role: 'user'`) are always displayed regardless of filters.

#### ChatMessageItem (Claude panel)

`src/components/panels/claude/chat-message-item.tsx` provides specialized
rendering based on the `ChatMessage.kind` field.

- `text`: ReactMarkdown + remarkGfm markdown rendering. Blinking cursor
  during streaming.
- `tool_use`: collapsible tool name header + JSON args. Collapsed by default.
- `auto_decision`: shield icon + allow/deny color label.
- `error`: destructive background + alert icon.
- `system`: bot icon + muted text.
- **Performance**: Wrapped with `React.memo` and a custom comparator (`id`, `content`, `isStreaming`) so only the actively-changing message re-renders. The message list uses `@tanstack/react-virtual` for virtualization, mounting only viewport-visible items in the DOM.

#### SessionInfoBar (Claude panel)

`src/components/panels/claude/session-info-bar.tsx` accepts a `tabId` prop and
subscribes to the corresponding tab's `ClaudeTabState.sessionStats` from
`useClaudeStore`, rendering a collapsible bar at the bottom of the Claude chat panel.

- Collapsed (default): a single line (h-6) —
  `{model} · {turns} turns · ctx {percent} [progress bar] · {tokens} tok · {updated}`.
  An inline mini progress bar (40px, 3px) is shown next to the context
  percentage (FR-514).
- Expanded: session ID, model, turn count, duration, input / output /
  cache-read tokens, and last-updated relative time. Additionally:
  - **Context progress bar**: full-width visual progress bar with numeric
    labels (FR-514).
  - **Model specs**: max output tokens, input/output price, capability badges
    (FR-513). Model spec lookup uses `findModelSpec` from
    `src/lib/claude/model-specs.ts`.
- The cumulative cost (`total_cost_usd`) is an estimate emitted by the Agent
  SDK and is intentionally **not** surfaced in either the collapsed or
  expanded view. It is still accumulated into `SessionStats.costUsd` and
  `ClaudeState.totalCost` for internal use (e.g. the `max-budget` cap check).
  See FR-504.
- The bar is collapsed by default so it never occludes the editor. The
  chevron toggle state is stored in `localStorage` under the key
  `claudegui-session-info-expanded`.
- No polling is required: the bar refreshes whenever new SDK events arrive
  over WebSocket. Only the "updated" relative time is recomputed via a
  1-second `setInterval`.

### usePreviewStore

```typescript
interface PreviewState {
  currentFile: string | null;
  currentType: PreviewType;
  pageNumber: number;
  zoomLevel: number;

  setFile(path: string): void;
  setPage(page: number): void;
  setZoom(level: number): void;
}
```

### Store update rules

- **React components**: subscribe via `use...Store()` hooks.
- **WebSocket handlers**: call `use...Store.getState().setState(...)` directly (outside React).
- **Persisted stores**: `useLayoutStore` (user layout), `useArtifactStore` (generated-content cache), and `useSettingsStore` (terminal font, selected model, and other user preferences).
- **Non-persisted**: editor/terminal/claude/preview (session data is fetched from the server).
- **Persist throttle**: `useLayoutStore` uses a custom storage adapter with 1-second debounce to minimize synchronous `localStorage` I/O during rapid state changes (e.g. panel resize drag). A synchronous flush is performed on `beforeunload`.

### Theme management — system theme, color-scheme, and FOUC prevention

`Theme` is `'dark' | 'light' | 'high-contrast' | 'retro-green' | 'system'`. `'system'` follows the OS `prefers-color-scheme` media query.

- **`useTheme` hook** (`src/hooks/use-theme.ts`): subscribes to `useLayoutStore.theme` and, when it is `'system'`, listens for the `change` event on `window.matchMedia('(prefers-color-scheme: dark)')` to resolve to `'dark'`/`'light'`. It applies the resolved theme class to `<html>` and sets the `color-scheme` CSS property to `'light'` or `'dark'` so that native UI elements (scrollbars, form controls) follow the app theme.
- **`resolveTheme()` utility** (`src/lib/terminal/terminal-themes.ts`): SSR-safe resolver that converts `'system'` to `'dark'`/`'light'`. Used by `TerminalManager` to pick the correct xterm ITheme on theme switches.
- **FOUC prevention**: an inline `<script>` in `src/app/layout.tsx`'s `<head>` reads the persisted theme from `localStorage` and immediately applies the `<html>` class and `color-scheme` before React hydration. This eliminates the flash from default-dark to the actual theme on first paint.

---

## 2.9 ArtifactGallery module (FR-1000)

A cross-cutting module that collects every code, HTML, Markdown, and SVG snippet Claude streams back *plus* every file Claude saves through `Write`/`Edit`/`MultiEdit` tools — images, PDFs, Word (`.docx`), Excel (`.xlsx`), PowerPoint (`.pptx`) — into a single place where the user can preview, copy, and export them. Runs independently of the editor/preview panels.

### Module layout

| File | Responsibility |
|------|----------------|
| `src/lib/claude/artifact-extractor.ts` | Regex-based text extractor (fenced blocks + stand-alone `<!doctype html>` / `<svg>`) and the `classifyByPath`/`isBinaryKind`/`titleFromPath` helpers that map an extension to a kind and decide inline vs. file-backed storage. Text artifacts get a `{messageId}:{index}` id. |
| `src/lib/claude/artifact-from-tool.ts` | Builds artifact records from `Write`/`Edit`/`MultiEdit` tool_use blocks. `Write` classifies by extension and either snapshots `input.content` inline or keeps only `filePath` for binary kinds. `Edit`/`MultiEdit` apply `old_string → new_string` patches against an existing inline baseline via `applyEditOps`. All tool_use artifacts share the `file:{absolutePath}` id so repeat Writes/Edits collapse into a single entry (FR-1008). |
| `src/stores/use-artifact-store.ts` | zustand store holding `artifacts`, `isOpen`, `autoOpen`, `highlightedId`, `pendingTurn`, `modalSize`, and the `extractFromMessage`/`ingestToolUse`/`findByFilePath`/`flushPendingOpen`/`open`/`close`/`setAutoOpen`/`setModalSize`/`remove`/`clear` actions. `persist` v3 writes up to 200 artifacts plus `autoOpen` and `modalSize` to `localStorage` (key `claudegui-artifacts`); `onRehydrateStorage` re-registers rehydrated `filePath`s with the server registry (FR-1009). |
| `src/lib/claude/artifact-export.ts` | `copyArtifact`, `availableExports`, `exportArtifact`, `exportWithRenderedHtml`, `printPdfDirect`. Inline text artifacts export to Source/HTML/Word (`.doc`)/PDF/PNG (`canvas.toBlob`). PDF goes through `printViaIframe()`, which mounts an invisible `<iframe>` with the standalone HTML (`srcdoc`, or a blob URL for content over 1.5 MB), waits for `decode()` on every `<img>` and two `requestAnimationFrame` ticks, then calls `contentWindow.print()`; cleanup fires from the `afterprint` event with a 60 s safety timer. The generated HTML ships with `@page` + `@media print` rules. File-backed binaries still go through `downloadBinaryFile`, which tries `/api/artifacts/raw` first and falls back to `/api/files/raw`. `exportWithRenderedHtml()` converts rendered HTML cached by preview components into an inline HTML artifact for PDF/HTML/Doc export. `printPdfDirect()` loads the original PDF file into a hidden iframe for direct printing. `availableExports(artifact, hasRenderedHtml?)` accepts an optional second argument to dynamically expose additional format options for file-backed types when rendered HTML is available. |
| `src/lib/claude/artifact-registry.ts` | Server-side in-process allowlist of absolute paths (max 1024, FIFO eviction). Exposes `registerArtifactPath`, `isArtifactPathRegistered`, `listArtifactPaths`, `clearArtifactRegistry`. |
| `src/lib/claude/artifact-url.ts` | Client-only URL helpers: `artifactRawUrl`, `projectRawUrl`, and `fetchArtifactBytes` (try registry, fall back to project raw endpoint). |
| `src/app/api/artifacts/register/route.ts` | `POST /api/artifacts/register`. Accepts `{ paths: [] }`, validates each path via `fs.stat` and the 50 MB binary cap, and registers it. Rate-limited through the shared `rateLimit`/`clientKey` helpers. |
| `src/app/api/artifacts/raw/route.ts` | `GET /api/artifacts/raw?path=<abs>`. Streams the bytes of a previously registered path using a broad MIME table that includes docx/xlsx/xlsm/pptx/PDF/images. |
| `src/components/panels/preview/docx-preview.tsx` | Converts DOCX → HTML with `mammoth/mammoth.browser` and injects the result into a fully sandboxed iframe. |
| `src/components/panels/preview/xlsx-preview.tsx` | Converts each sheet with SheetJS (`xlsx`) via `sheet_to_html`, with a tab switcher for multi-sheet workbooks. |
| `src/components/panels/preview/pptx-preview.tsx` | Unzips the OOXML with JSZip, extracts `<a:t>` text runs per slide, and surfaces referenced media images as `URL.createObjectURL` thumbnails inside a 16:9 slide view. |
| `src/components/panels/preview/pdf-preview.tsx` | Gains an optional `srcOverride` prop so the artifact gallery can reuse the same viewer with an `/api/artifacts/raw` URL. |
| `src/components/modals/artifacts-modal.tsx` | The Radix Dialog gallery. 10 kind badges, Preview/Source toggle, per-kind renderer routing, file-backed fallback card, and the `Auto-open`/`Clear all` toolbar. |

### Data flow

```text
WebSocket /ws/claude
   └─► use-claude-store.handleServerMessage
         ├─ assistant message
         │    ├─ text  → useArtifactStore.extractFromMessage(msgId, sid, text)
         │    │           └─► artifact-extractor.extractArtifacts
         │    │                 └─► new text artifacts → pendingTurn[]
         │    └─ tool_use (Write / Edit / MultiEdit)
         │         └─► useArtifactStore.ingestToolUse(toolMsgId, sid, tool)
         │               ├─► artifactFromWrite / artifactFromEdit
         │               │    └─► dedupe by `file:{absolutePath}`
         │               └─► POST /api/artifacts/register (filePath)
         └─ result
              └─► useArtifactStore.flushPendingOpen()
                    └─► if autoOpen && pendingTurn.length > 0 → isOpen = true

useArtifactStore (localStorage rehydrate)
   └─► onRehydrateStorage → POST /api/artifacts/register(paths[])

ArtifactsModal preview
   └─► fetchArtifactBytes(filePath)
         ├─► GET /api/artifacts/raw?path=<abs>   (registry hit)
         └─► GET /api/files/raw?path=<abs>       (project-scoped fallback)
```

Session restore (`useClaudeStore.loadSession`) calls `extractFromMessage(..., { silent: true })` so historical text artifacts repopulate the gallery without triggering the auto-popup. File-backed artifacts are re-admitted to the server registry in `onRehydrateStorage`.

### Design choices

- **Cross-project access path** — files that Claude wrote in a previous project must still be readable during the rest of the session, even though `resolveSafe` tightly scopes `/api/files/raw` to the active project root. The registry solves this with a narrow "only the absolute paths we already admitted" allowlist: it bypasses the project sandbox without opening arbitrary file reads. The registry lives in memory and is rebuilt from the persisted store on hydration.
- **localStorage protection** — base64-encoding binaries into `localStorage` would blow the ~5 MB browser quota immediately. Binary kinds therefore keep `content` empty and only persist `filePath`. Text kinds keep snapshotting inline so they remain usable after a project switch.
- **Office viewers are dynamically imported** — `mammoth` (~800 KB), `xlsx`, and `jszip` are only fetched the first time the user opens a document of that kind, so the initial page load stays lean.
- **Auto-popup only on `result`** — popping the dialog mid-stream would hurt readability, so `flushPendingOpen` is called exactly once per turn on the Agent SDK's `result` event.
- **Recoverable failures** — if `window.open` is blocked or `<canvas>` rasterisation fails the export path falls back to downloading the source HTML. If previewing a binary artifact fails the viewer swaps to a metadata card with a single Export button.

---

## 2.10 Remote Access Module (FR-1300)

Dynamically switches the server binding address and manages external access through token authentication.

### Server-side components

| File | Role |
|------|------|
| `src/lib/server-config.mjs` | Read/write `~/.claudegui/server-config.json` |
| `src/lib/server-config-wrapper.ts` | TypeScript wrapper for API routes |
| `src/app/api/server/status/route.ts` | Server status query (hostname, port, LAN IPs) |
| `src/app/api/server/config/route.ts` | Configuration read/write |
| `src/app/api/server/restart/route.ts` | In-process server restart trigger |

### server.js changes

- **Config loading**: reads `remoteAccess` and `remoteAccessToken` from `~/.claudegui/server-config.json` at startup.
- **Dynamic hostname**: `0.0.0.0` when `remoteAccess: true`, otherwise `127.0.0.1`. The `HOST` env var takes precedence.
- **Token middleware**: validates `Authorization: Bearer` header on HTTP requests and `?token=` query parameter on WebSocket upgrades. Localhost requests are exempt.
- **In-process restart**: `global.__restartServer` function closes only the HTTP/WS servers and recreates them with new settings. The Next.js `app.prepare()` result is reused.

### Client-side components

| File | Role |
|------|------|
| `src/stores/use-remote-access-store.ts` | Remote access state management (Zustand, no localStorage) |
| `src/components/modals/remote-access-modal.tsx` | Settings modal (toggle, token, network info) |
| `src/components/layout/header.tsx` | Globe icon button (green when active) |
| `src/components/layout/status-bar.tsx` | "Remote (IP)" status display |
| `src/lib/runtime.ts` | Tauri runtime detection (`isTauri()`) |

### Data flow

```
User → Globe button → RemoteAccessModal
  ├─ Toggle change → PUT /api/server/config → ~/.claudegui/server-config.json
  └─ Apply → POST /api/server/restart (standalone)
           └─ invoke('restart_server') (Tauri)
               ↓
       Close HTTP+WS servers → Reload config → New server listen
               ↓
       Poll /api/health → Update status → Close modal
```

---

## 2.11 MCP Server Integration Module (FR-1400, ADR-025)

### Server-side components

| File | Role |
|------|------|
| `src/lib/claude/settings-manager.ts` | `ClaudeSettings.mcpServers` type definitions (`McpServerEntry`, `McpServerConfig`) |
| `server-handlers/claude-handler.mjs` | Loads MCP servers in `runQuery()` and passes to SDK, exports `getMcpServerStatus()` |
| `src/app/api/mcp/route.ts` | `GET/PUT /api/mcp` — MCP server config CRUD |
| `src/app/api/mcp/status/route.ts` | `GET /api/mcp/status` — queries SDK session for MCP connection statuses |

### Client-side components

| File | Role |
|------|------|
| `src/stores/use-mcp-store.ts` | MCP state management (Zustand, no persist — source of truth is server) |
| `src/components/modals/mcp-servers-modal.tsx` | MCP server management modal (add/edit/delete/toggle, preset templates) |
| `src/components/layout/header.tsx` | Blocks icon button (blue when active servers exist) |
| `src/components/layout/status-bar.tsx` | "MCP: N servers" status indicator |
| `src/components/command-palette/command-palette.tsx` | "MCP: Manage Servers", "MCP: Refresh Status" entries |

### Data flow

```
User → Blocks button / Cmd+K "MCP" → McpServersModal
  ├─ Add/edit/delete/toggle server → PUT /api/mcp → .claude/settings.json (mcpServers merge)
  └─ Status query → GET /api/mcp/status → sdk.mcpServerStatus()
               ↓
On Claude query:
  runQuery() → loadSettings() → filter enabled servers → queryOptions.mcpServers
               ↓
  SDK manages MCP process lifecycle, communication, and tool routing
               ↓
  MCP tool call → canUseTool(ADR-011) permission gate → existing allow/deny modal
```

---

## 2.12 Multi-Browser Independent Projects Module (FR-1500, ADR-027)

### Server-side components

| File | Role |
|------|------|
| `src/lib/project/browser-session-registry.mjs` | `browserId → { root, lastSeen }` mapping management, refCount-based watcher sharing, 30-min GC |
| `server.js` | Extracts `?browserId=` on WebSocket upgrade, extracts `X-Browser-Id` header on REST requests |
| `server-handlers/files-handler.mjs` | Subscribes watchers by per-`browserId` project root, sends `project-changed` events only to matching `browserId` connections. Events are debounced in a 150ms batch window to prevent client flooding during bulk file changes (npm install, git checkout) |
| `server-handlers/claude-handler.mjs` | Uses per-`browserId` project root as `runQuery()` cwd, `persistSession: false` to prevent session lock contention, `_activeQueries` Map for per-browser active Query tracking |
| `server-handlers/terminal-handler.mjs` | Uses per-`browserId` project root as initial cwd for PTY spawn |

### Client-side components

- On tab load, the client looks up `browserId` from `sessionStorage` and generates a UUID if absent.
- All HTTP requests include the `X-Browser-Id` header.
- WebSocket connection URLs include the `?browserId=<uuid>` query parameter.

### Data flow

```
Tab A (project-foo)                     Tab B (project-bar)
  │ browserId=aaa                        │ browserId=bbb
  │                                      │
  └─→ X-Browser-Id: aaa ──┐   ┌── X-Browser-Id: bbb ←─┘
                           ▼   ▼
                      server.js
                           │
                  BrowserSessionRegistry
                  ┌────────┴────────┐
                  │  aaa → /foo     │  bbb → /bar
                  └────────┬────────┘
                    ┌──────┴──────┐
               watcher(/foo)  watcher(/bar)   ← refCount-based sharing
                    │              │
              project-changed → Tab A only   project-changed → Tab B only
```

### Fallback when `browserId` is missing

Requests without `browserId` (e.g., old clients) fall back to the existing `ProjectContext` global singleton (ADR-016) via `getActiveRoot()`. This preserves backward compatibility.

---

## 2.13 Recent additions (Phase 1–3)

Quick map of modules added during Phase 1–3 (ADR-028..033). See the individual ADRs for decision rationale.

### Stability layer (Phase 1, ADR-028..031)

- `src/components/layout/error-boundary.tsx` — `<ErrorBoundary scope>` and `<PanelErrorBoundary panelType>`. `leaf-panel.tsx::renderPanel()` wraps every mounted panel, and `app-shell.tsx` wraps the root. `registerErrorSink(fn)` exposes a plug point for Sentry or other collectors (ADR-028).
- `src/lib/claude/request-aborter.ts` — a thin `registerAborter(fn)` / `abortRequest(id)` registry. `getClaudeClient()` registers its own `abort`, and `use-claude-store` aborts synchronously outside the Zustand reducer (ADR-029).
- `src/stores/claude/{types,helpers,extractors}.ts` — behavior-preserving decomposition of the 1,333-line store into type declarations, pure helpers, and module-level maps. Public selectors are unchanged and types are re-exported (ADR-031).
- `server-handlers/files-handler.mjs` — per-connection `acquired: boolean` flag; the registry listener was switched to acquire-before-release (ADR-030).

### Performance layer (Phase 2, ADR-032)

- `src/components/ui/relative-time.tsx` — `<RelativeTime>` owns its `now` state and pauses the timer under the Page Visibility API when the document is hidden.
- `src/stores/use-claude-store.ts` — the `content_block_delta` branch of `handleServerMessage` now does incremental `last.content + delta` concat (amortized O(n) instead of O(n²)).
- `src/components/panels/claude/claude-chat-view.tsx::StreamingActivityBar` — takes only `tabId` and subscribes via `useShallow` so it re-renders only when `toolName`/`filePath` actually change.
- `src/lib/fs/rate-limit.ts` — 5-minute throttled bucket GC.

### UX layer (Phase 3, ADR-033)

- `src/hooks/use-panel-jump.ts` + `PANEL_JUMP_ORDER` — Ctrl/Cmd+1..5 panel focus jump, registered in `app-shell.tsx`.
- `src/stores/use-layout-presets-store.ts` + `src/components/layout/layout-presets-menu.tsx` — three built-in presets (Editor Focus / Preview Split / Terminal Focus) plus persisted user presets.
- `src/lib/editor/buffer-recovery.ts` + `src/hooks/use-buffer-recovery-persist.ts` + `src/stores/use-recovery-store.ts` + `src/components/modals/recovery-modal.tsx` — debounced localStorage stash of dirty buffers (256KB cap, 1s debounce) and a recovery modal on boot.
- `src/app/api/files/replace/route.ts` + `src/lib/fs/replace-logic.ts` — dry-run-by-default Global Replace API. `resolveSafe` per target, 1MB per-file cap, 200-file batch cap.
