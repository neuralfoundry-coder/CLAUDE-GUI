# 3. Data Flow

> English mirror of [`docs/architecture/03-data-flow.md`](../../architecture/03-data-flow.md).

## 3.1 Claude Command Execution Flow

End-to-end flow when the user sends a query to Claude and receives a response.

```
User                Browser (React)           Server (Node.js)         Claude CLI
  │                     │                          │                       │
  │ 1. enter prompt      │                          │                       │
  │──────────────────▶│                          │                       │
  │                     │ 2. ws.send({type: query})│                       │
  │                     │─────────────────────────▶│                       │
  │                     │                          │ 3. Agent SDK query()  │
  │                     │                          │──────────────────────▶│
  │                     │                          │                       │
  │                     │                          │◀────────── assistant │
  │                     │ ws.send({type: message}) │   event (streaming)   │
  │                     │◀─────────────────────────│                       │
  │                     │                          │                       │
  │ 4. live text display│                          │                       │
  │◀──────────────────│                          │                       │
  │                     │                          │◀─────── tool_use     │
  │                     │                          │   (Edit, Bash, ...)  │
  │                     │                          │                       │
  │                     │                          │ [permission? → UC-03]│
  │                     │ permission_request        │                       │
  │                     │◀─────────────────────────│                       │
  │ 5. modal shown      │                          │                       │
  │◀──────────────────│                          │                       │
  │                     │                          │                       │
  │ 6. approve/deny     │                          │                       │
  │──────────────────▶│                          │                       │
  │                     │ permission_response       │                       │
  │                     │─────────────────────────▶│                       │
  │                     │                          │ (approved) tool run   │
  │                     │                          │──────────────────────▶│
  │                     │                          │◀──────── file edit   │
  │                     │                          │                       │
  │                     │                          │◀────────── result    │
  │                     │                          │ (cost, usage,         │
  │                     │                          │  modelUsage)          │
  │                     │ ws.send({type: result})  │                       │
  │                     │◀─────────────────────────│                       │
  │ 7. cost / token /   │                          │                       │
  │    context % shown  │                          │                       │
  │◀──────────────────│                          │                       │
```

**Related FR**: FR-501, FR-502, FR-504, FR-505

---

## 3.2 File Edit and Sync Flow

### 3.2.1 Direct user edit

```
User              Monaco Editor       useEditorStore       Server (REST)      File system
  │                   │                    │                   │                   │
  │ 1. keystrokes      │                    │                   │                   │
  │─────────────────▶│                    │                   │                   │
  │                   │ 2. onChange event   │                   │                   │
  │                   │───────────────────▶│                   │                   │
  │                   │                    │ 3. markDirty()    │                   │
  │                   │                    │                   │                   │
  │ 4. Cmd+S save      │                    │                   │                   │
  │─────────────────▶│                    │                   │                   │
  │                   │                    │ 5. saveFile()     │                   │
  │                   │                    │───────────────────▶                    │
  │                   │                    │                   │ 6. POST /api/     │
  │                   │                    │                   │   files/write    │
  │                   │                    │                   │─────────────────▶│
  │                   │                    │                   │◀─────── success │
  │                   │                    │◀─────── success  │                   │
  │                   │                    │ 7. markDirty(false)                  │
  │                   │◀───────────────────│                   │                   │
```

### 3.2.2 External edit by Claude

```
Claude CLI      File system       @parcel/watcher  Server (WS)     Browser         Monaco
   │                │                 │                │              │                │
   │ 1. file edit    │                 │                │              │                │
   │──────────────▶│                 │                 │              │                │
   │                │ 2. change event  │                │              │                │
   │                │───────────────▶│                 │              │                │
   │                │                 │ 3. /ws/files    │              │                │
   │                │                 │   broadcast     │              │                │
   │                │                 │────────────────▶│              │                │
   │                │                 │                │ 4. ws message │                │
   │                │                 │                │──────────────▶│                │
   │                │                 │                │              │ 5. fetchFile() │
   │                │                 │                │              │               │ (REST)
   │                │                 │                │              │◀── content ── │
   │                │                 │                │              │ 6. apply to    │
   │                │                 │                │              │   Monaco model │
   │                │                 │                │              │──────────────▶│
   │                │                 │                │              │                │ cursor preserved
```

**Note**: when Claude edits, diff mode is activated → the user accepts/rejects before final application (FR-305).

**Related FR**: FR-307, FR-308, FR-907

---

## 3.3 Terminal Data Flow

### Input (user → PTY)

```
user keystrokes
  │
  ▼
xterm.js onData event
  │
  ▼
ws.send(JSON {type:"input", data})   ← text frame
  │
  ▼
server.js /ws/terminal handler
  │
  ▼
ptyProcess.write(data)
  │
  ▼
shell process stdin
```

### Output (PTY → user, no drops)

```
shell process stdout
  │
  ▼
ptyProcess.onData
  │
  ▼
server queue (Buffer[]) push ─── [paused] ─── flush suspended (no drops)
  │                                │
  │                                ▼
  │                          [bufferedBytes > 256 KB]
  │                                │
  │                                ▼
  │                          ptyProcess.pause() — stop upstream
  │
  ▼ (16 ms batch timer)
Buffer.concat(queue)
  │
  ▼
ws.send(buf, {binary: true})         ← binary frame
  │
  ▼
Browser WebSocket onmessage
  │
  ▼
typeof event.data === 'string'?
  │   └── yes: parseServerControlFrame → handle exit/error
  │
  ▼ (ArrayBuffer)
TerminalManager.writePtyBytes
  │
  ▼
backpressure check (watermarks)
  │
  ├── pendingBytes < 100 KB → term.write(bytes) → GPU rendering
  │
  └── pendingBytes ≥ 100 KB → ws.send(JSON {type:"pause"})
                                └─ when the write callback drops below 10 KB,
                                   ws.send(JSON {type:"resume"}) and the
                                   server calls ptyProcess.resume() + flushes.
```

If `bufferedBytes` exceeds 5 MB the server sends `{type:"error", code:"BUFFER_OVERFLOW"}`, kills the PTY, and closes the WebSocket with code 1011 — data is never silently lost on any path.

### Resize sync

```
panel resize OR tab activation OR font-size change
  │
  ▼
TerminalManager.scheduleFit  (requestAnimationFrame, up to 10 retries)
  │
  ▼
host clientWidth/Height > 0 ?
  │
  ▼ yes
fitAddon.fit() → recalculates cols, rows
  │
  ▼ (only if cols/rows changed)
ws.send(JSON {type:"resize", cols, rows})
  │
  ▼
ptyProcess.resize(cols, rows) → shell receives SIGWINCH
```

**Related FR**: FR-401, FR-403, FR-404, FR-407, FR-408, FR-409

---

## 3.4 Permission Request Flow

```
Agent SDK       Permission        WebSocket         Browser         User
  │             Interceptor        /ws/claude       UI
  │                 │                  │              │              │
  │ 1. tool_use     │                  │              │              │
  │   event          │                  │              │              │
  │────────────────▶│                  │              │              │
  │                 │ 2. is permission  │              │              │
  │                 │   required?       │              │              │
  │                 │                  │              │              │
  │                 │ 3. check          │              │              │
  │                 │   .claude/        │              │              │
  │                 │   settings.json   │              │              │
  │                 │   allow list       │              │              │
  │                 │                  │              │              │
  │                 │ [match] → auto-approve                            │
  │                 │                  │              │              │
  │                 │ [no match]        │              │              │
  │                 │                  │              │              │
  │                 │ 4. permission_   │              │              │
  │                 │   request        │              │              │
  │                 │─────────────────▶│              │              │
  │                 │                  │ 5. WS message│              │
  │                 │                  │─────────────▶│              │
  │                 │                  │              │ 6. show modal│
  │                 │                  │              │─────────────▶│
  │                 │                  │              │              │
  │                 │                  │              │◀──── 7. click│
  │                 │                  │              │ approve/deny │
  │                 │                  │◀─────────────│              │
  │                 │ 8. permission_   │              │              │
  │                 │   response       │              │              │
  │                 │◀─────────────────│              │              │
  │ 9. SDK response │                  │              │              │
  │◀────────────────│                  │              │              │
  │                 │                  │              │              │
  │ [approved] run tool → file edit → return result                     │
  │                 │                  │              │              │
```

**Related FR**: FR-505, FR-506

---

## 3.5 Preview Update Flow

### On file selection

```
user click (FileTree)
  │
  ▼
useEditorStore.openFile(path)
  │
  ▼
usePreviewStore.setFile(path)  ← preview sync
  │
  ▼
PreviewRouter → type detection
  │
  ├── HTML → HTMLPreview (iframe srcdoc)
  ├── PDF → PDFPreview (react-pdf)
  ├── MD → MarkdownPreview
  ├── Image → ImagePreview
  └── Slides → SlidePreview (reveal.js)
```

### On editor change

```
Monaco onChange event
  │
  ▼
debounce(300 ms)
  │
  ▼
[check preview type]
  │
  ├── HTML → re-set iframe srcdoc (or patch CSS via postMessage)
  ├── MD → re-render react-markdown
  ├── Slides → postMessage UPDATE_SLIDE → Reveal.sync()
  └── PDF → (not editable)
```

### Universal live streaming flow (FR-610, v0.6)

All language code fences and all file type Write/Edit/MultiEdit tool uses from Claude's assistant response are detected and displayed as a multi-page live preview:

```
Claude stream (assistant message)
  │
  ▼
UniversalStreamExtractor  (O(n) scan — scanOffset-based)
  ├── feedText(chunk) — detects all ```language fences (html, python, typescript, etc.)
  │   ├── fence open → onPageStart(page)  → useLivePreviewStore.addPage(page)
  │   ├── chunk accum → onPageChunk(id, content, renderable) → updatePageContent
  │   └── fence close → onPageComplete(id, content) → completePage
  │
  └── feedToolUse(tool) — all file types Write/Edit/MultiEdit
      ├── Write → onPageStart + onPageChunk + onPageComplete
      ├── Edit/MultiEdit → baseline applyEditOps → onPageChunk + onPageComplete
      └── onWritePath → setGeneratedFilePath(filePath)
            │
            ▼
     useLivePreviewStore { pages: LivePage[], activePageIndex }
            │
            ▼
     <LiveStreamPreview>
      ├── <PageNavBar>        (multi-page tab navigation)
      └── <ActivePageRenderer>
           ├── viewMode === 'source' → <SourcePreview> (highlight.js)
           └── viewMode === 'rendered'
                ├── html → iframe srcdoc (150ms debounce)
                ├── svg → iframe srcdoc
                ├── markdown → ReactMarkdown (200ms debounce)
                ├── code → <SourcePreview> (syntax highlighted)
                └── text → <pre> block
```

- Each page has an independent `viewMode` (source/rendered) that can be toggled.
- When `renderable` transitions from false to true, the view automatically switches to rendered mode.
- When an editor tab is open for the page's `filePath`, editor content is used as the source.

### Partial-edit preservation flow (FR-610)

How the rendering of untouched pages is preserved when a follow-up query edits only a few sections of a multi-page document:

```
First query: Write /tmp/deck.html (all 5 pages)
  │
  ▼
UniversalStreamExtractor.feedToolUse(Write)
  ├── baselines.set('/tmp/deck.html', content)
  ├── onPageStart → addPage({kind:'html', ...})
  ├── onPageChunk → updatePageContent(pageId, content, true)
  └── onPageComplete → completePage(pageId, content)

(query end: finalizeExtractor → currentExtractor = null)
(startStream preserves pages)

Second query: "just fix the title on page 3"
  │
  ▼
ensureExtractor() — new UniversalStreamExtractor
  └── seedBaseline(page.filePath, page.content)   // restore from existing pages
  │
  ▼
UniversalStreamExtractor.feedToolUse(Edit {old_string, new_string})
  ├── baselines lookup → applyEditOps(baseline, [op])
  ├── onPageChunk → updatePageContent(pageId, patched, true)  // all 5 pages preserved
  └── onPageComplete → completePage(pageId, patched)
```

**Baseline disk fallback**: when the first interaction of a fresh session is an `Edit`/`MultiEdit` and no in-memory baseline exists:

```
UniversalStreamExtractor.feedToolUse(Edit)
  │
  ▼
baselines empty → onNeedBaseline(filePath, apply)
  │
  ▼
useClaudeStore.fetchFileContent
  │
  ▼
GET /api/files/read?path=... → { content }
  │
  ▼
apply(content) → applyEditOps → onPageChunk/onPageComplete
```

`MultiEdit`'s `edits[]` are applied in array order and the `replace_all` flag is honored. If an `old_string` is not present in the baseline, that operation is skipped so the preview state stays stable.

**Related FR**: FR-606, FR-610, FR-704

---

## 3.6 Presentation Conversational Edit Flow

```
User                Claude            Server          Browser (React)       iframe (reveal.js)
  │                   │                 │                 │                       │
  │ 1. "Add a chart    │                 │                 │                       │
  │    to slide 3"     │                 │                 │                       │
  │─────────────────▶│                 │                 │                       │
  │                   │ 2. read current  │                 │                       │
  │                   │    slide HTML    │                 │                       │
  │                   │────────────────▶│                 │                       │
  │                   │◀── file content ─│                 │                       │
  │                   │                 │                 │                       │
  │                   │ 3. edit HTML    │                 │                       │
  │                   │    (Edit tool)  │                 │                       │
  │                   │────────────────▶│                 │                       │
  │                   │                 │ 4. file write    │                       │
  │                   │                 │ → @parcel/      │                       │
  │                   │                 │   watcher picks  │                       │
  │                   │                 │   it up          │                       │
  │                   │                 │                 │                       │
  │                   │                 │ 5. /ws/files    │                       │
  │                   │                 │   change event  │                       │
  │                   │                 │────────────────▶│                       │
  │                   │                 │                 │ 6. reload file         │
  │                   │                 │                 │─ (REST)                │
  │                   │                 │                 │                       │
  │                   │                 │                 │ 7. postMessage         │
  │                   │                 │                 │   UPDATE_SLIDE         │
  │                   │                 │                 │──────────────────────▶│
  │                   │                 │                 │                       │ 8. DOM patch
  │                   │                 │                 │                       │   Reveal.sync()
  │ 9. see change      │                 │                 │                       │
  │◀──────────────────────────────────────────────────────────────────────────── │
```

**Key point**: the iframe is not reloaded — only the DOM is patched, so the user sees the slide change without interruption.

**Related FR**: FR-703, FR-704

---

## 3.7 State Management Data Flow

### Zustand store update paths

```
┌─────────────────────────────────────────────────────┐
│                 Zustand Stores                      │
│  ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌────────┐  │
│  │ layout   │ │ editor  │ │ terminal │ │ claude │  │
│  └────┬─────┘ └────┬────┘ └────┬─────┘ └───┬────┘  │
│       │            │            │           │       │
└───────┼────────────┼────────────┼───────────┼──────┘
        │            │            │           │
        │            │            │           │
   ┌────▼────┐  ┌────▼────┐  ┌────▼────┐  ┌───▼────┐
   │ React   │  │ React   │  │ React   │  │ React  │
   │ (subs)  │  │ (subs)  │  │ (subs)  │  │ (subs) │
   └─────────┘  └─────────┘  └─────────┘  └────────┘
        ▲            ▲            ▲           ▲
        │            │            │           │
   ┌────┴────┐  ┌────┴────┐  ┌────┴────┐  ┌───┴────┐
   │ user    │  │ user    │  │  WS     │  │  WS    │
   │ actions │  │ input   │  │ /ws/    │  │ /ws/   │
   │         │  │         │  │ terminal│  │ claude │
   └─────────┘  └─────────┘  └─────────┘  └────────┘
```

### Layout state flow (panel collapse)

All 5 panels have their collapsed state managed in `useLayoutStore` and synced to the DOM panels via `ImperativePanelHandle` imperative API:

```
user action (button, shortcut, resize drag)
  │
  ▼
useLayoutStore.togglePanel(panelId) / setCollapsed(panelId, bool)
  │
  ▼
store state change: {panelId}Collapsed = true | false
  │
  ▼
useEffect detection (app-shell.tsx)
  │
  ├── collapsed → panelRef.current.collapse()
  └── expanded  → panelRef.current.expand()
        │
        ▼
react-resizable-panels internal layout recalculation
  │
  ▼
onCollapse / onExpand callback → setCollapsed re-sync
```

In the mobile layout (< 1280px), panel collapsing is replaced by `mobileActivePanel` state that switches a single active panel:

```
tab bar tap → setMobileActivePanel(panelId) → MobileShell re-render
```

### Persistence

```
useLayoutStore ─── persist middleware (v3) ──▶ localStorage (1s throttle)
                                                key: 'claudegui-layout'
                                                includes: panel sizes, 5 collapsed states,
                                                          theme, mobileActivePanel

(other stores are not persisted)
```

### WebSocket handler → store update

```typescript
// src/lib/websocket/claude-handler.ts
const ws = new WebSocket('/ws/claude');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  // Update store directly, outside React hooks
  switch (msg.type) {
    case 'message':
      useClaudeStore.getState().appendMessage(msg.data);
      break;
    case 'permission_request':
      useClaudeStore.getState().setPendingPermission(msg);
      break;
    case 'result':
      useClaudeStore.getState().updateCost(msg.data);
      break;
    case 'completion_response':
      // AI inline completion response → dispatched to registered callback (FR-309)
      claudeClient.handleCompletionResponse(msg);
      break;
  }
};
```

This lets WebSocket events update state independently of the React render cycle.

**Related FR**: FR-104, FR-308, FR-309, FR-507
