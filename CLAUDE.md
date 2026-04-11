# CLAUDE.md - ClaudeGUI Project Conventions

> **Bilingual documentation policy (MANDATORY)**: 모든 문서는 한국어(본 파일, `README.md`, `docs/srs/`, `docs/architecture/`)와 영어(`CLAUDE-EN.md`, `README-EN.md`, `docs/en/srs/`, `docs/en/architecture/`)로 **동시에** 작성·갱신·삭제되어야 한다. 한쪽만 갱신된 커밋은 미완료로 간주한다. 자세한 규칙은 아래 [Bilingual Documentation Policy](#bilingual-documentation-policy) 참조.

## Mandatory Workflow for Feature Changes

**Every feature change (new feature, modification, refactor, or bug fix affecting behavior) MUST follow this workflow. No exceptions.**

### Before starting any feature change

1. **Review `docs/srs/`** — Read relevant functional requirements (FR-xxx) and non-functional requirements (NFR-xxx). Determine whether the proposed change is consistent with existing requirements.
2. **Review `docs/architecture/`** — Read relevant architecture documents (component design, data flow, API design, security). Determine whether the proposed change fits the existing architecture.
3. **Make a suitability judgment** — If the change is out of scope, conflicts with existing requirements, or violates architectural decisions (ADRs), stop and flag it to the user before writing any code. Do not proceed until alignment is confirmed.

### After completing any feature change

All of the following steps are required. Do not mark work as complete until every applicable step is done:

1. **Update `docs/srs/`** — Add, modify, or remove functional/non-functional requirements to reflect the actual behavior. Keep FR/NFR numbering consistent. Update use cases (`05-use-cases.md`) if user-facing flows changed.
2. **Update `docs/architecture/`** — Update component design, data flow diagrams, API specs, or security documents as needed. Add a new ADR entry if the change involves an architectural decision.
3. **Verify in `tests/`** — Add or update unit, integration, or E2E tests that cover the change. Run the full relevant test suite and confirm it passes. Never mark the change complete with failing tests.
4. **Apply database migrations (only if applicable)** — ClaudeGUI v1.0 does **not** use a persistent database; session data is managed by Claude CLI under `~/.claude/projects/` and UI preferences are stored in `localStorage`. If a future change introduces a persistent schema, create a `migrations/` directory, add a migration file, and apply it to both local and production environments. Until then this step does not apply.
5. **Update `README.md`** — Reflect the change in the project README: new features, changed setup steps, updated commands, new environment variables, or updated screenshots.
6. **Update English mirrors (MANDATORY)** — In the **same change**, update every English counterpart that mirrors a Korean document you touched:
   - `docs/srs/*.md` → `docs/en/srs/*.md` (same file name, same section structure)
   - `docs/architecture/*.md` → `docs/en/architecture/*.md`
   - `README.md` → `README-EN.md`
   - `CLAUDE.md` → `CLAUDE-EN.md`
   A change is **not complete** until both language versions are in sync. See [Bilingual Documentation Policy](#bilingual-documentation-policy).

### Enforcement

- When asked to make a change, explicitly confirm that you have reviewed `docs/srs/` and `docs/architecture/` before writing code.
- At the end of a change, explicitly list which docs/tests/README files were updated — including both Korean and English mirrors — or state that no update was required and why.
- If you skip any step, you must state the reason in the response.
- **Never land a Korean-only or English-only documentation change.** If you touch `docs/srs/03-functional-requirements.md`, you must also touch `docs/en/srs/03-functional-requirements.md`. Same for every other mirrored file.

---

## Bilingual Documentation Policy

ClaudeGUI maintains **all** user-facing documentation in both Korean (primary authoring language) and English (mirror). Both versions are first-class: neither may drift from the other.

### Mirrored file pairs

| Korean (source) | English (mirror) |
|-----------------|------------------|
| `CLAUDE.md` | `CLAUDE-EN.md` |
| `README.md` | `README-EN.md` |
| `docs/srs/*.md` | `docs/en/srs/*.md` |
| `docs/architecture/*.md` | `docs/en/architecture/*.md` |

- `docs/research/` is a historical planning archive and is **not** mirrored.
- Code comments and commit messages remain in English (see Git Conventions).

### Rules

1. **Simultaneous updates.** Every edit that touches a Korean document in the mirrored list must, in the same commit, update the corresponding English file with an equivalent change. The reverse also holds.
2. **Structural parity.** Section headings, ordering, tables, code blocks, ADR IDs, and FR/NFR/UC identifiers must match 1:1 between the two versions. Do not renumber in one language without doing it in the other.
3. **New files.** When creating a new Korean document under `docs/srs/` or `docs/architecture/`, create the English counterpart under `docs/en/srs/` or `docs/en/architecture/` at the same path in the same commit.
4. **Deletions and renames.** When deleting or renaming a Korean file, perform the same operation on its English mirror in the same commit.
5. **Technical terms, identifiers, and code** (function names, file paths, environment variables, package names, shell commands) stay untranslated in both versions.
6. **Links** should point to the same-language counterpart where possible (e.g., `CLAUDE-EN.md` links to `README-EN.md`, Korean docs link to Korean docs).
7. **Discrepancy is a bug.** If you discover that the Korean and English versions have drifted, treat it as a defect and fix both to a single consistent state before continuing with feature work.

### Checklist (apply at the end of every change)

- [ ] Every Korean file I edited has a matching English update in this commit.
- [ ] Every English file I edited has a matching Korean update in this commit.
- [ ] New files were created in both languages (or neither).
- [ ] Deleted files were removed from both languages (or neither).
- [ ] Section structure, tables, and IDs match between the two versions.

---

## Project Overview

ClaudeGUI is a web-based IDE that wraps Anthropic's Claude CLI, providing a professional 4-panel layout (file explorer, code editor, terminal, multi-format preview) with real-time streaming via WebSocket.

## Tech Stack

- **Framework**: Next.js 14+ (App Router) with custom `server.js`
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + shadcn/ui (Radix primitives)
- **State**: Zustand v5 (global) + Jotai (fine-grained)
- **Editor**: Monaco Editor (`@monaco-editor/react`)
- **Terminal**: xterm.js v5 (`@xterm/xterm`) + node-pty
- **File Tree**: react-arborist v3.4
- **Panels**: react-resizable-panels v4
- **Preview**: react-pdf, react-markdown, reveal.js, iframe srcdoc
- **WebSocket**: ws library (NOT socket.io)
- **CLI Integration**: @anthropic-ai/claude-agent-sdk
- **File Watching**: @parcel/watcher v2 (native FSEvents / inotify / RDCW)
- **Command Palette**: cmdk

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages & layouts
│   ├── layout.tsx
│   ├── page.tsx
│   └── api/                # REST API route handlers
│       ├── auth/
│       ├── files/
│       ├── project/
│       └── sessions/
├── components/
│   ├── ui/                 # shadcn/ui primitives (do not modify)
│   ├── panels/             # Panel container components
│   │   ├── file-explorer/
│   │   ├── editor/
│   │   ├── terminal/
│   │   └── preview/
│   ├── layout/             # App shell, panel group, header, auth badge
│   ├── modals/             # Permission, project picker, login prompt
│   └── command-palette/    # cmdk integration
├── hooks/                  # Custom React hooks
├── stores/                 # Zustand store slices
├── lib/                    # Utility functions, helpers
│   ├── websocket/          # WS client manager
│   ├── fs/                 # File system utilities (server-side)
│   ├── project/            # Runtime ProjectContext singleton (ADR-016)
│   └── claude/             # Agent SDK wrapper + html-stream-extractor
├── types/                  # Shared TypeScript type definitions
└── styles/                 # Global CSS (Tailwind base)
server.js                   # Custom Node.js server (WS + Next.js)
scripts/
├── install/                # One-line install scripts (macOS/Linux/Windows)
└── installer-runtime/      # Tauri in-app helpers (ensure-claude-cli, …)
installer/
└── tauri/                  # Tauri v2 native installer (.dmg/.msi) (ADR-018)
docs/
├── research/               # Planning & research documents
├── srs/                    # Software Requirements Specification (Korean)
├── architecture/           # Architecture design documents (Korean)
└── en/                     # English mirrors
    ├── srs/
    └── architecture/
```

## Code Conventions

### TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- Prefer `interface` over `type` for object shapes
- Use explicit return types for exported functions
- No `any` — use `unknown` with type narrowing
- Enums: use `as const` objects instead of TypeScript enums

### React

- Function declarations for components (not arrow functions)
- `"use client"` directive required for client components (Monaco, xterm, etc.)
- Props interface named `{ComponentName}Props`
- Use Zustand for cross-component state, not React Context for global state
- No prop drilling beyond 2 levels — lift to store or compose

### Naming

- **Files**: kebab-case (`file-explorer.tsx`, `use-editor-store.ts`)
- **Components**: PascalCase (`FileExplorer`, `EditorPanel`)
- **Hooks**: camelCase with `use` prefix (`useEditorStore`, `useWebSocket`)
- **Stores**: camelCase with `use` prefix (`useLayoutStore`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_BUFFER_SIZE`)
- **CSS**: Tailwind utility classes only — no custom CSS files per component

### Imports

- Absolute imports via `@/` alias (maps to `src/`)
- Group order: `react` → `next` → external libs → `@/` internal → relative
- No barrel exports (`index.ts` re-exports) — import directly from source

## State Management

- **Zustand v5** with slices pattern for modularity
- Store files: `src/stores/use-{name}-store.ts`
- WebSocket message handlers update stores directly (outside React lifecycle)
- `persist` middleware: layout preferences and user settings only
- Terminal buffers: never store in Zustand — use xterm.js internal buffer
- Stores:
  - `useLayoutStore`: panel sizes, collapsed states
  - `useEditorStore`: open files, active tab, dirty states
  - `useTerminalStore`: session list, active session ID
  - `useClaudeStore`: sessions, messages, cost, permission requests
  - `usePreviewStore`: current preview type, page number, zoom

## WebSocket Protocol

- Server: `ws` library on custom server.js
- Client: native `WebSocket` API with reconnection wrapper
- Message format: JSON with `type` field as discriminator
- Endpoints:
  - `/ws/terminal` — PTY data (binary frames for output, JSON for resize)
  - `/ws/claude` — Agent SDK streaming (NDJSON events)
  - `/ws/files` — `@parcel/watcher` file change notifications
- Reconnection: exponential backoff (1s initial, 30s cap)
- Heartbeat: 29-second ping interval
- Next.js HMR WebSocket (`/_next/webpack-hmr`) must be preserved in server.js upgrade handler

## File System Security

- **Always** use `resolveSafe(basePath, userPath)` to validate paths
- **Never** serve dotfiles (`.env`, `.git`, `.claude`) via API
- Validate symlinks with `fs.lstat()` before following
- Enforce file size limits on read/write operations
- Rate-limit file system API endpoints

## Preview Security

- HTML preview: `sandbox="allow-scripts"` only — **never** `allow-same-origin`
- Communication with iframe via `postMessage` only
- Markdown: use sanitize options, no `dangerouslySetInnerHTML`
- PDF: render via Web Worker (pdf.js) to avoid main-thread blocking

## Performance Guidelines

- Terminal output: batch at 16ms intervals (60 FPS sync)
- Preview updates: debounce 300ms minimum
- File tree: virtualized rendering (react-arborist handles this)
- Monaco: CDN loader (`@monaco-editor/loader`), not webpack bundle
- Images: lazy load with Intersection Observer
- xterm.js: WebGL addon for GPU-accelerated rendering
- Backpressure: watermark flow control (100KB high / 10KB low) on terminal

## Testing

- **Unit**: Vitest + React Testing Library
- **E2E**: Playwright
- **Test files**: co-located as `*.test.ts(x)` or in `__tests__/` directory
- **Coverage target**: 70%+ for components and utilities

## Build & Run

```bash
# Development (custom server required — do NOT use `next dev` alone)
node server.js

# Production
npm run build && NODE_ENV=production node server.js

# Default port: 3000 (override with PORT env var)
```

## Git Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)
- **Branches**: `feature/`, `fix/`, `docs/` prefixes
- **Language**: Commit messages in English

## Key Dependencies — Do Not Replace Without Discussion

| Package | Purpose |
|---------|---------|
| `@anthropic-ai/claude-agent-sdk` | Claude CLI programmatic integration |
| `react-resizable-panels` | 4-panel collapsible layout |
| `@monaco-editor/react` | VS Code-grade code editor |
| `@xterm/xterm` + `node-pty` | Terminal emulation (client + server) |
| `react-arborist` | Virtualized file tree |
| `reveal.js` | HTML presentation engine |
| `ws` | WebSocket server |
| `@parcel/watcher` | File system watching (native backend, ADR-024) |
| `zustand` | State management |
| `cmdk` | Command palette (Cmd+K) |
| `react-pdf` | PDF rendering |
| `react-markdown` | Markdown rendering |
| `PptxGenJS` | PPTX export |

## Common Pitfalls

- Monaco Editor requires `"use client"` in Next.js App Router
- `node-pty` needs native build tools (`python3`, `make`, `g++`)
- Never combine `allow-scripts` + `allow-same-origin` in iframe sandbox
- xterm.js has 50MB write buffer limit — implement watermark backpressure
- Do not re-introduce `chokidar` — on macOS it falls back to `fs.watch` (1 FD/dir) and hits the 256 per-process soft limit, crashing with `EMFILE` (ADR-024). Use `@parcel/watcher` which holds one OS handle per root via FSEvents/inotify/RDCW.
- Custom server disables Next.js Automatic Static Optimization
- `server.js` must handle WebSocket upgrade for both HMR and app endpoints
