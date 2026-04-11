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
  │                     │                          │   (cost, usage)       │
  │                     │ ws.send({type: result})  │                       │
  │                     │◀─────────────────────────│                       │
  │ 7. cost/token shown │                          │                       │
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
Claude CLI      File system       chokidar         Server (WS)     Browser         Monaco
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
WebSocket.send(binary data)
  │
  ▼
server.js /ws/terminal handler
  │
  ▼
node-pty.write(data)
  │
  ▼
shell process stdin
```

### Output (PTY → user)

```
shell process stdout
  │
  ▼
node-pty onData event
  │
  ▼
Batching Buffer (16 ms window)   ← 60 FPS sync
  │
  ▼
WebSocket.send(binary data)
  │
  ▼
Browser WebSocket onmessage
  │
  ▼
backpressure check (watermarks)
  │
  ├── OK → xterm.write(data)
  │         │
  │         ▼
  │        GPU rendering (WebGL addon)
  │
  └── HIGH → ws.send({type: "pause"}) → server pauses output
```

### Resize sync

```
browser window resize
  │
  ▼
ResizeObserver fires
  │
  ▼
FitAddon.fit() → recalculates cols, rows
  │
  ▼
ws.send({type: "resize", cols, rows})
  │
  ▼
node-pty.resize(cols, rows)
  │
  ▼
shell process receives SIGWINCH
```

**Related FR**: FR-401, FR-403, FR-404, FR-407

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

**Related FR**: FR-606, FR-704

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
  │                   │                 │ → chokidar      │                       │
  │                   │                 │   detects        │                       │
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

### Persistence

```
useLayoutStore ─── persist middleware ──▶ localStorage
                                          key: 'claudegui-layout'

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
  }
};
```

This lets WebSocket events update state independently of the React render cycle.

**Related FR**: FR-104, FR-308, FR-507
