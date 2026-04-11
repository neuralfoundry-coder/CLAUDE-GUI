# 1. System Architecture Overview

> English mirror of [`docs/architecture/01-system-overview.md`](../../architecture/01-system-overview.md).

## 1.1 Architecture Overview

ClaudeGUI adopts a **hybrid local-server architecture**. The browser (React frontend) runs on the local machine and communicates with a custom Node.js server via WebSocket/REST; the server manages local resources such as the Claude CLI, the file system, and PTY.

### Why a custom Node.js server?

| Requirement | Serverless (Vercel) | Custom Node.js | Chosen |
|-------------|---------------------|----------------|--------|
| Bidirectional WebSocket streaming | ❌ limited | ✅ native | ✅ |
| Long-running Claude sessions | ❌ timeout | ✅ stateful | ✅ |
| Local filesystem access | ❌ not possible | ✅ direct `fs` module | ✅ |
| node-pty integration | ❌ not possible | ✅ native module | ✅ |
| File watching (`@parcel/watcher`) | ❌ stateless | ✅ persistent watching | ✅ |
| Session persistence | ❌ stateless | ✅ stateful | ✅ |

**Conclusion**: the custom Node.js server (`server.js`) is the only viable choice.

## 1.2 System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     Browser (Chrome)                             │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │         Next.js App (React + TypeScript)                   │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  UI Layer (4-Panel Layout)                            │  │  │
│  │  │  ┌─────────┬─────────────────────┬────────────────┐  │  │  │
│  │  │  │  File   │   Monaco Editor     │  Preview       │  │  │  │
│  │  │  │Explorer │   (Multi-Tab)       │  (HTML/PDF/    │  │  │  │
│  │  │  │         ├─────────────────────┤  MD/Slides)    │  │  │  │
│  │  │  │         │   Terminal (xterm)  │                │  │  │  │
│  │  │  └─────────┴─────────────────────┴────────────────┘  │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  State Layer (Zustand Stores)                        │  │  │
│  │  │  layout │ editor │ terminal │ claude │ preview      │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  Communication Layer                                  │  │  │
│  │  │  WebSocket Clients │ REST API Client                  │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
         │                                    │
         │ WebSocket                          │ HTTP REST
         │ (ws library)                       │
         ▼                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│              Custom Node.js Server (server.js)                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  HTTP Server + WebSocket Upgrade Handler                   │  │
│  └───────┬────────────────────────────────────────┬───────────┘  │
│          │                                        │              │
│  ┌───────▼────────┐                    ┌──────────▼───────────┐  │
│  │ WebSocket      │                    │ Next.js Request      │  │
│  │ Router         │                    │ Handler (SSR, API)   │  │
│  │                │                    │                      │  │
│  │ /ws/terminal   │                    │ /api/files/*         │  │
│  │ /ws/claude     │                    │ /api/sessions/*      │  │
│  │ /ws/files      │                    │                      │  │
│  └───┬─────┬──┬───┘                    └──────────────────────┘  │
│      │     │  │                                   │              │
│      ▼     ▼  ▼                                   ▼              │
│  ┌─────┐┌──────┐┌──────────┐              ┌──────────────┐     │
│  │node-││Agent ││@parcel/  │              │  fs/promises │     │
│  │pty  ││SDK   ││watcher   │              │  (sandboxed) │     │
│  └──┬──┘└──┬───┘└────┬─────┘              └──────┬───────┘     │
└─────┼──────┼─────────┼───────────────────────────┼─────────────┘
      │      │         │                           │
      ▼      ▼         ▼                           ▼
   ┌─────┐ ┌──────────┐ ┌─────────────────────────────────────┐
   │Shell│ │Claude CLI│ │      Local File System              │
   │(PTY)│ │ Process  │ │   /project/src, /project/docs, ...  │
   └─────┘ └──────────┘ └─────────────────────────────────────┘
```

## 1.3 Tech-Stack Decision Table

### Frontend

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | Next.js 14+ App Router | SSR + custom-server support |
| **Language** | TypeScript (strict) | Type safety, refactoring stability |
| **UI Library** | React 18+ | Ecosystem, App Router compatibility |
| **Styling** | Tailwind CSS + shadcn/ui | Utility-first; Radix-based a11y |
| **Panels** | react-resizable-panels v4 | 5.2k stars, localStorage, collapse/expand |
| **Editor** | @monaco-editor/react | VS Code engine, 100+ languages |
| **File Tree** | react-arborist v3.4 | Virtualized, drag-and-drop, F2 inline edit |
| **Terminal** | @xterm/xterm v5 | 17k stars, WebGL acceleration |
| **State** | Zustand v5 | Lightweight, persist middleware |
| **Command Palette** | cmdk | Proven at Linear/Vercel |
| **PDF Viewer** | react-pdf v10 | pdf.js 5.x, Web Worker |
| **Markdown** | react-markdown + remark-gfm | AST-based, XSS-safe |
| **Slides** | reveal.js 5.x | 70k stars, `Reveal.sync()` API |
| **Icons** | lucide-react | Consistent style, tree-shakable |

### Backend

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Runtime** | Node.js 20+ LTS | `@parcel/watcher`/node-pty native ABI, ESM dynamic import |
| **Server** | Next.js + custom server.js | WebSocket required |
| **WebSocket** | ws v8 | Lightweight, standards-compliant |
| **Terminal Backend** | node-pty | Maintained by Microsoft; PTY sessions |
| **File Watching** | @parcel/watcher v2 | Native FSEvents/inotify backend, one OS handle per root (ADR-024) |
| **CLI Integration** | @anthropic-ai/claude-agent-sdk | Official SDK, type-safe |
| **PPTX Export** | PptxGenJS | Pure JS, no external dependencies |

## 1.4 Layered Structure

### Presentation Layer

- **Role**: UI rendering, user-input handling, layout management
- **Components**: React components (panels, editor, terminal, preview)
- **Location**: `src/components/`, `src/app/`

### State Layer

- **Role**: Global state management, WebSocket message dispatch, persistence
- **Components**: Zustand stores (layout, editor, terminal, claude, preview)
- **Location**: `src/stores/`

### Communication Layer

- **Role**: Bidirectional server communication, reconnection management, message serialization
- **Components**: WebSocket clients, REST API client
- **Location**: `src/lib/websocket/`, `src/lib/api/`

### Business Logic Layer — server side

- **Role**: Request routing, authentication, file operations, Claude session management
- **Components**: Next.js API handlers, WebSocket handlers
- **Location**: `src/app/api/`, handler modules in `server.js`

### Infrastructure Layer — server side

- **Role**: Access to external resources (filesystem, PTY, Claude CLI)
- **Components**: node-pty, `@parcel/watcher`, fs/promises, Agent SDK wrapper
- **Location**: `src/lib/fs/`, `src/lib/claude/`, `src/lib/pty/`

## 1.5 Key Architecture Decisions (ADR)

### ADR-001: Choose the `ws` library

**Decision**: use the `ws` library instead of socket.io.

**Context**: need to choose a WebSocket implementation.

**Rationale**:
- `ws`: ~5 KB overhead, standard WebSocket compliance
- `socket.io`: ~10.4 KB overhead, includes fallback mechanisms (not needed)
- Direct compatibility with the browser-native `WebSocket`
- Easy integration with the Next.js custom server

**Result**: low overhead, standards-compliant, simple integration.

---

### ADR-002: Use the Agent SDK

**Decision**: use `@anthropic-ai/claude-agent-sdk` instead of `child_process.spawn()` directly.

**Context**: how to drive the Claude CLI programmatically.

**Rationale**:
- `child_process.spawn()` reports hang issues with the Claude CLI
- Agent SDK exposes the event stream via an async generator
- Type-safe `SDKMessage` events
- Built-in session management (resume, fork)
- `startup()` pre-warming (~20× faster first query)

**Result**: improved reliability, less code complexity, automated session management.

---

### ADR-003: Choose Monaco Editor

**Decision**: use Monaco Editor instead of CodeMirror 6.

**Context**: selecting the code-editor engine.

**Rationale**:
- Same engine as VS Code → developer familiarity
- Built-in syntax highlighting for 100+ languages
- IDE features: IntelliSense, code folding, multiple cursors, etc.
- Built-in diff viewer (for showing AI changes)
- CDN loading mitigates the bundle-size issue

**Alternatives considered**:
- CodeMirror 6: lightweight but lacks IDE features and requires extra configuration

**Tradeoff**: 5–10 MB bundle size → solved via the CDN loader.

---

### ADR-004: Choose react-resizable-panels

**Decision**: use `react-resizable-panels` v4 for the panel layout.

**Context**: implementing the four-panel layout.

**Rationale**:
- 5.2k GitHub stars, actively maintained
- `autoSaveId` for automatic `localStorage` persistence
- Native collapse/expand support (`collapsedSize`)
- Nested `PanelGroup` support (vertical + horizontal)
- Built-in keyboard accessibility

---

### ADR-005: Zustand for state management

**Decision**: use Zustand v5 instead of Redux/Redux Toolkit.

**Context**: selecting a global state management library.

**Rationale**:
- Minimal boilerplate (no actions/reducers)
- Stores can be accessed outside React → convenient for WebSocket handlers
- Built-in `persist` middleware (localStorage persistence)
- Slice pattern enables easy modularity
- Low learning curve

**Alternatives considered**:
- Redux Toolkit: powerful but too much boilerplate
- Jotai: atomic model; planned for supplementary use with fine-grained state

---

### ADR-006: Choose reveal.js

**Decision**: use reveal.js 5.x instead of Marp.

**Context**: selecting the HTML presentation engine.

**Rationale**:
- 70k GitHub stars, battle-tested
- `Reveal.sync()` API enables slide updates without reloads
- Auto-Animate, 12 themes, speaker notes
- Programmatic control (`Reveal.slide(h, v, f)`)
- PDF/PPTX export tools exist (DeckTape, PptxGenJS)

**Alternatives considered**:
- Marp: Markdown-based and simple, but with limited dynamic-edit API
- Slidev: Vue-based → mismatched with the React stack

---

### ADR-007: Custom Node.js server

**Decision**: use a custom `server.js` instead of Vercel deployment.

**Context**: selecting the deployment model.

**Rationale**: see the table in §1.1 (WebSocket, node-pty, long-lived sessions, and other requirements).

**Tradeoff**: Automatic Static Optimization is disabled; only Docker/Railway/Fly.io/self-hosted deployments are possible.

---

### ADR-008: HTML preview via iframe srcdoc

**Decision**: use iframe `srcdoc` + sandbox instead of direct `innerHTML` injection.

**Context**: HTML preview implementation strategy.

**Rationale**:
- Full CSS/JS isolation (sandboxing)
- Minimizes XSS attack surface
- `sandbox="allow-scripts"` (without `allow-same-origin`)
- Parent-child communication is controlled via `postMessage`
- When only CSS changes, styles are patched via `postMessage` to avoid iframe reload

**Caveat**: **never** combine `allow-same-origin` with `allow-scripts` (it invalidates the sandbox).
