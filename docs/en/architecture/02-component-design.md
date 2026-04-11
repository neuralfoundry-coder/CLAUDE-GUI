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

    <PanelGroup direction="horizontal">
      <Panel id="file-explorer" collapsible>
        <FileExplorerPanel>
          <FileExplorerHeader />
          <FileTree />                 (react-arborist)
        </FileExplorerPanel>
      </Panel>

      <PanelResizeHandle />

      <Panel id="center">
        <PanelGroup direction="vertical">
          <Panel id="editor">
            <EditorPanel>
              <EditorTabBar />
              <MonacoEditor />         (@monaco-editor/react)
              <DiffAcceptBar />        (when Claude edits)
            </EditorPanel>
          </Panel>

          <PanelResizeHandle />

          <Panel id="terminal" collapsible>
            <TerminalPanel>
              <TerminalTabBar />
              <XTerminal />            (xterm.js)
            </TerminalPanel>
          </Panel>
        </PanelGroup>
      </Panel>

      <PanelResizeHandle />

      <Panel id="preview" collapsible>
        <PreviewPanel>
          <PreviewHeader />
          <PreviewRouter>              (by file type)
            <HTMLPreview />            (iframe srcdoc)
            <PDFPreview />             (react-pdf)
            <MarkdownPreview />        (react-markdown)
            <ImagePreview />           (react-zoom-pan-pinch)
            <SlidePreview />           (reveal.js)
          </PreviewRouter>
        </PreviewPanel>
      </Panel>
    </PanelGroup>

    <StatusBar />
    <CommandPalette />                 (cmdk modal)
    <PermissionRequestModal />         (when Claude requests permission)
  </RootLayout>
</App>
```

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
│       ├── /ws/terminal                → PTY Session Handler
│       ├── /ws/claude                  → Agent SDK Handler
│       └── /ws/files                   → Chokidar Broadcaster
│
└── lib/
    ├── fs/                             ← Sandboxed file system
    │   ├── resolve-safe.ts
    │   ├── file-operations.ts
    │   └── watcher.ts                  (chokidar)
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
├── file-explorer-panel.tsx         # container
├── file-explorer-header.tsx        # title, new-file button
├── file-tree.tsx                   # react-arborist wrapper
├── file-tree-node.tsx              # per-node renderer
├── file-icon.tsx                   # icon by extension
├── git-status-indicator.tsx        # Git status badge
├── context-menu.tsx                # right-click menu
└── use-file-tree.ts                # data-loading hook
```

### Key behavior

1. **Data loading**: the `useFileTree` hook calls `/api/files?path=<root>` to build the tree nodes.
2. **Virtualization**: `react-arborist`'s built-in virtual scrolling.
3. **Git status**: call `/api/git/status` to build a per-file status map → overlay.
4. **Live updates**: receive `/ws/files` WebSocket events to update tree nodes.
5. **Context menu**: uses Radix UI `@radix-ui/react-context-menu`.

## 2.4 EditorPanel Component

### File structure

```
src/components/panels/editor/
├── editor-panel.tsx                # container
├── editor-tab-bar.tsx              # tab list
├── editor-tab.tsx                  # individual tab (close button, dirty indicator)
├── monaco-editor-wrapper.tsx       # Monaco wrapper
├── diff-accept-bar.tsx             # AI diff accept/reject UI
└── use-editor-models.ts            # Monaco model management
```

### State management

```typescript
// useEditorStore (Zustand)
interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  openFile(path: string): void;
  closeTab(id: string): void;
  setActiveTab(id: string): void;
  markDirty(id: string, dirty: boolean): void;
  applyClaudeEdit(path: string, edit: EditOperation): void;
}

interface EditorTab {
  id: string;
  path: string;
  modelId: string;     // Monaco model reference
  dirty: boolean;
  locked: boolean;     // while Claude is editing
  diff?: DiffState;    // pending AI changes
}
```

### Model management

- A dedicated Monaco model is created per file (`monaco.editor.createModel`).
- On tab close, `dispose()` is called on the model (to prevent leaks).
- Switching tabs only swaps the model on the editor instance → cursor/scroll/undo are preserved automatically.

### AI diff handling

```typescript
// When Claude edits a file
function applyClaudeEdit(path: string, newContent: string) {
  const tab = findTab(path);
  tab.diff = {
    original: tab.modelId.getValue(),
    modified: newContent,
    status: 'pending',
  };
  tab.locked = true;  // switch to read-only
  // show DiffAcceptBar
}

// When the user accepts
function acceptDiff(tabId: string) {
  const tab = findTab(tabId);
  tab.modelId.setValue(tab.diff.modified);
  tab.diff = null;
  tab.locked = false;
}
```

## 2.5 TerminalPanel Component

### Design overview

`TerminalPanel` follows a **thin-attach pattern** so that React's lifecycle cannot touch PTY processes. Both the xterm.js `Terminal` instance and the WebSocket connection are owned by a `TerminalManager` singleton that lives outside the component tree; React components merely supply a DOM host.

- **Owner**: `TerminalManager` singleton (`src/lib/terminal/terminal-manager.ts`)
- **Attach point**: `XTerminalAttach` (`src/components/panels/terminal/x-terminal.tsx`) — the host div is wrapped in a Radix `ContextMenu`
- **Container + tab UI**: `TerminalPanel` (`src/components/panels/terminal/terminal-panel.tsx`) — inline rename, cwd label, unread indicator, project-change banner, Restart chip, split-pane renderer
- **Search overlay**: `TerminalSearchOverlay` (`src/components/panels/terminal/terminal-search-overlay.tsx`)
- **State**: `useTerminalStore` (`src/stores/use-terminal-store.ts`) — tab list, active session ID, session status (`connecting` / `open` / `closed` / `exited`), cwd, displayName, unread, searchOverlayOpen, splitEnabled, primarySessionId, secondarySessionId, activePaneIndex
- **Socket wrapper**: `src/lib/terminal/terminal-socket.ts` (`TerminalSocket`) — no auto-reconnect. When a reconnect is needed the manager opens a new socket carrying the `serverSessionId` via URL query (FR-414).
- **Server-side session registry**: `server-handlers/terminal/session-registry.mjs` (`TerminalSessionRegistry` singleton) — manages PTY lifetime, 256 KB ring buffer, 30-minute GC, and transient/exit listener fan-out. ADR-020.
- **Shell resolver**: `server-handlers/terminal/shell-resolver.mjs` (`resolveShell`, `shellFlags`, `buildPtyEnv`)
- **File explorer integration**: `src/app/api/files/reveal/route.ts` (Reveal in Finder/Explorer), `filesApi.reveal`, and the `file-tree.tsx` context menu's `Open terminal here` (WS URL `?cwd=<path>`)
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
| Socket open | The `createSocket` `onOpen` callback sends an initial `resize` frame. On the first open, it schedules `injectShellHelpers(inst)` 250 ms later to install the OSC 7 emitter snippet via a single `{type:"input"}` frame. |
| React attach | `XTerminalAttach`'s `useEffect` → `terminalManager.attach(id, host)`. The manager appends its persistent `<div>` into `host`, calls `term.open()` on first attach only, waits for a non-zero rect with `requestAnimationFrame`, runs `fit()`, sends a resize frame, and calls `focus()`. The WebGL addon is lazy-loaded at this point. |
| Tab switch | Store `setActiveSession` → `terminalManager.activate(id)` → `fit()` + `focus()`. `searchOverlayOpen` is reset to false. |
| Font-size change | Manager subscription callback → `setFontSize(px)` → sets `term.options.fontSize` and re-fits every instance. No PTY restart. |
| Panel collapse | `<TerminalPanel>` unmounts → `XTerminalAttach.useEffect` cleanup → `terminalManager.detach(id)`. The manager unparents its persistent `<div>` but keeps xterm and the WS alive. |
| Unexpected socket close | The `createSocket` `onClose` callback transitions status to `closed` and writes `[connection to PTY lost]` to the xterm buffer. **No reconnect attempt**. |
| Shell exit | Server sends `{type:"exit", code}` control frame → `applyServerControl` transitions status to `exited`. The tab remains until the user closes it. |
| Restart | `restartSession(id)` — permitted only when `closed`/`exited`. Keeps the xterm buffer (no `dispose`), inserts a `─── restarted at HH:MM:SS ───` separator, resets `pendingBytes`/`paused`/`exitCode`, sets status `connecting`, and calls `createSocket(inst)` again. `helpersInjected=true` ensures the OSC 7 snippet is not re-injected. |
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

### Search overlay (FR-405)

The `TerminalInstance` retains its `searchAddon` so `findNext`, `findPrevious`, and `clearDecorations` can be exposed as public manager methods. `TerminalSearchOverlay` owns its toggle state (match case / whole word / regex) and a 100 ms debounced incremental search. On close, it clears decorations and returns focus to xterm via `terminalManager.activate(id)`.

## 2.6 PreviewPanel Component

### File structure

```
src/components/panels/preview/
├── preview-panel.tsx               # container
├── preview-header.tsx              # type indicator, controls
├── preview-router.tsx              # selects renderer by type
├── html-preview.tsx                # iframe srcdoc
├── pdf-preview.tsx                 # react-pdf
├── markdown-preview.tsx            # react-markdown
├── image-preview.tsx               # zoom/pan
├── slide-preview.tsx               # reveal.js iframe
└── use-preview-content.ts          # content loading
```

### Router logic

```typescript
function PreviewRouter({ filePath, content }: Props) {
  const ext = getExtension(filePath);
  switch (ext) {
    case 'html':
      return isRevealSlide(content)
        ? <SlidePreview content={content} />
        : <HTMLPreview content={content} />;
    case 'pdf':
      return <PDFPreview path={filePath} />;
    case 'md':
    case 'markdown':
      return <MarkdownPreview content={content} />;
    case 'png': case 'jpg': case 'jpeg':
    case 'gif': case 'svg': case 'webp':
      return <ImagePreview path={filePath} />;
    default:
      return <UnsupportedPreview ext={ext} />;
  }
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

### SlidePreview implementation

```typescript
function SlidePreview({ content }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Patch the DOM without reload when slides change
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'UPDATE_SLIDE',
      slides: content.slides,
    }, '*');
  }, [content.slides]);

  return (
    <iframe
      ref={iframeRef}
      src="/reveal-host.html"  // reveal.js host page
      sandbox="allow-scripts"
      className="w-full h-full border-0"
    />
  );
}

// Inside reveal-host.html
window.addEventListener('message', (e) => {
  if (e.data.type === 'UPDATE_SLIDE') {
    updateSlideDOM(e.data.slides);
    Reveal.sync();
  }
});
```

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

## 2.8 State Management (Zustand Stores)

### useLayoutStore

```typescript
interface LayoutState {
  // panel sizes (%)
  fileExplorerSize: number;
  editorSize: number;
  terminalSize: number;
  previewSize: number;

  // collapsed state
  fileExplorerCollapsed: boolean;
  terminalCollapsed: boolean;
  previewCollapsed: boolean;

  // theme
  theme: 'dark' | 'light' | 'high-contrast';

  // actions
  setPanelSize(panel: string, size: number): void;
  togglePanel(panel: string): void;
  setTheme(theme: Theme): void;
}

// persist middleware applied
export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({ ... }),
    { name: 'claudegui-layout' }
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
  sessions: ClaudeSession[];
  activeSessionId: string | null;
  messages: Record<string, ClaudeMessage[]>;  // sessionId → messages
  pendingPermissionRequest: PermissionRequest | null;
  totalCost: Record<string, number>;
  tokenUsage: Record<string, { input: number; output: number }>;
  // Per-session context / usage snapshot, populated only from values the SDK
  // actually emits.
  sessionStats: Record<string, SessionStats>;

  sendQuery(prompt: string): Promise<void>;
  resumeSession(id: string): void;
  forkSession(id: string): string;
  respondToPermission(approved: boolean): void;
}
```

`sessionStats` is accumulated only from values that the Agent SDK actually
sends: the `model` field from the `system.init` event, and `num_turns`,
`duration_ms`, `usage.*`, `total_cost_usd` from `result` events. Fields the
SDK does not provide remain `null` and are rendered as "-" in the UI. Values
such as the context window size are never hardcoded — only data present in
actual responses is exposed.

#### SessionInfoBar (Claude panel)

`src/components/panels/claude/session-info-bar.tsx` subscribes to the active
session's `SessionStats` from `useClaudeStore` and renders a collapsible bar
at the bottom of the Claude chat panel.

- Collapsed (default): a single line (h-6) —
  `{model} · {turns} turns · ctx {used}/{limit} ({pct}) · {tokens} tok · {updated}`.
- Expanded: session ID, model, turn count, duration, input / output /
  cache-read tokens, and last-updated relative time.
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
- **Persisted stores**: `useLayoutStore` (user layout) and `useArtifactStore` (generated-content cache).
- **Non-persisted**: editor/terminal/claude/preview (session data is fetched from the server).

---

## 2.9 ArtifactGallery module (FR-1000)

A cross-cutting module that collects every code, HTML, Markdown, and SVG snippet Claude streams back into a single place where the user can copy or export them. It runs independently of the editor/preview panels and is composed of four core files.

### Module layout

| File | Responsibility |
|------|----------------|
| `src/lib/claude/artifact-extractor.ts` | Regex-based extractor that walks an assistant text and returns `ExtractedArtifact[]` — fenced code blocks, stand-alone `<!doctype html>` documents, and stand-alone `<svg>` elements. Each item gets a stable `{messageId}:{index}` id plus inferred language, kind, title, and extension. |
| `src/stores/use-artifact-store.ts` | A zustand store holding `artifacts`, `isOpen`, `autoOpen`, `highlightedId`, `pendingTurn`, along with `extractFromMessage/flushPendingOpen/open/close/remove/clear` actions. The `persist` middleware writes `artifacts` and `autoOpen` to `localStorage` (key: `claudegui-artifacts`). The store is capped at 200 entries. |
| `src/lib/claude/artifact-export.ts` | Exposes `copyArtifact`, `availableExports`, and `exportArtifact` and handles source (`.ts`/`.py`/`.html`/…), HTML, PDF (via `window.print()`), Word (`.doc`), and SVG→PNG (via `canvas.toBlob`) outputs. It relies only on browser APIs — no new dependencies. |
| `src/components/modals/artifacts-modal.tsx` | The Radix Dialog gallery. Left-hand list + right-hand preview, Copy/Export/Delete actions, and an `Auto-open`/`Clear all` toolbar at the top. Subscribes directly to `useArtifactStore`. |

### Data flow

```text
WebSocket /ws/claude
   └─► use-claude-store.handleServerMessage
         ├─ assistant message → useArtifactStore.extractFromMessage(msgId, sid, text)
         │                         └─► artifact-extractor.extractArtifacts
         │                               └─► new artifacts → pendingTurn[]
         └─ result                → useArtifactStore.flushPendingOpen()
                                      └─► if autoOpen && pendingTurn.length > 0 → isOpen = true
```

Session restore (`useClaudeStore.loadSession`) calls `extractFromMessage(..., { silent: true })` so that historical artifacts repopulate the gallery without triggering the auto-popup.

### Design choices

- **No new dependencies** — existing deps such as `pptxgenjs`/`react-pdf`/`react-markdown` remain unused on the artifact path. Export relies solely on `Blob` + `<a download>`, `window.print()`, and `<canvas>` APIs. Even heterogeneous formats like PDF and DOCX are produced without adding bundle weight, via the print dialog and a Word-HTML trick.
- **Auto-popup only on `result`** — popping the dialog mid-stream would hurt readability, so `flushPendingOpen` is called exactly once per turn on the Agent SDK's `result` event.
- **200-artifact cap** — comfortably within the browser's localStorage budget (~5 MB), with oldest entries evicted first.
- **Recoverable failures** — if `window.open` is blocked or `<canvas>` rasterisation fails, the export path falls back to downloading the source HTML.
