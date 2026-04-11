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
- **Attach point**: `XTerminalAttach` (`src/components/panels/terminal/x-terminal.tsx`)
- **Container + tab UI**: `TerminalPanel` (`src/components/panels/terminal/terminal-panel.tsx`)
- **State**: `useTerminalStore` (`src/stores/use-terminal-store.ts`) — tab list, active session ID, session status (`connecting` / `open` / `closed` / `exited`)
- **Framing helpers**: `src/lib/terminal/terminal-framing.ts`

The manager emits session-status events; the store subscribes and reflects them in the tab labels.

### TerminalManager lifecycle

| Event | Behavior |
|---|---|
| App boot (`app-shell.tsx`) | `terminalManager.boot()` is called once. It subscribes to `useLayoutStore.fontSize` and registers an HMR hot-dispose hook. |
| Session creation | Store `createSession` → `terminalManager.ensureSession(id)`. xterm is constructed and the WebSocket is opened (PTY spawns here). `term.open()` is deferred. |
| React attach | `XTerminalAttach`'s `useEffect` → `terminalManager.attach(id, host)`. The manager appends its persistent `<div>` into `host`, calls `term.open()` on first attach only, waits for a non-zero rect with `requestAnimationFrame`, runs `fit()`, sends a resize frame, and calls `focus()`. |
| Tab switch | Store `setActiveSession` → `terminalManager.activate(id)` → `fit()` + `focus()`. |
| Font-size change | Manager subscription callback → `setFontSize(px)` → sets `term.options.fontSize` and re-fits every instance. No PTY restart. |
| Panel collapse | `<TerminalPanel>` unmounts → `XTerminalAttach.useEffect` cleanup → `terminalManager.detach(id)`. The manager unparents its persistent `<div>` but keeps xterm and the WS alive. |
| Tab close | Store `closeSession(id)` → `terminalManager.closeSession(id)` → ws.close (server kills PTY). Then `term.dispose()` and removal from the map. |
| Shell exit | Server sends `{type:"exit", code}` control frame → manager writes the banner and marks status `exited`. The tab remains until the user closes it. |

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
