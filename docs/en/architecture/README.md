# ClaudeGUI Architecture Design Documents

> This file is the English mirror of [`docs/architecture/README.md`](../../architecture/README.md). Both files must be updated together — see [CLAUDE-EN.md](../../../CLAUDE-EN.md#bilingual-documentation-policy).

| Item | Value |
|------|-------|
| **Document version** | 1.0 |
| **Date** | 2026-04-11 |
| **Status** | Draft |

## Table of Contents

1. [System overview](./01-system-overview.md)
2. [Component design](./02-component-design.md)
3. [Data flow](./03-data-flow.md)
4. [API design](./04-api-design.md)
5. [Security architecture](./05-security-architecture.md)
6. [Deployment & operations](./06-deployment.md)

## Architecture Decisions (ADR) Summary

| ID | Decision | Rationale |
|----|----------|-----------|
| ADR-001 | `ws` library (instead of socket.io) | Low overhead (~5 KB vs 10.4 KB); standards-compliant WebSocket |
| ADR-002 | Use the Agent SDK (instead of child_process) | Avoids CLI hang issues; type safety; session management |
| ADR-003 | Monaco Editor (instead of CodeMirror) | VS Code-level features; 100+ languages; developer familiarity |
| ADR-004 | `react-resizable-panels` | 5.2k stars; localStorage support; collapse/expand |
| ADR-005 | Zustand (instead of Redux) | Lightweight; accessible outside React; minimal boilerplate |
| ADR-006 | reveal.js (instead of Marp) | 70k stars; rich API; live editing via `Reveal.sync()` |
| ADR-007 | Custom Node.js server (instead of Vercel) | WebSocket required; long-lived process support |
| ADR-008 | iframe srcdoc (instead of eval) | Sandboxing security; postMessage communication |
| ADR-009 | Use `git` CLI for Git status | Avoids isomorphic-git bundle cost; performance and simplicity — `src/lib/fs/git-status.ts` |
| ADR-010 | Separate `/api/files/raw` binary endpoint | Dedicated to image/PDF streaming; security boundary separate from text READ |
| ADR-011 | Agent SDK `canUseTool` callback for permission handling | Uses the official SDK option instead of intercepting the tool_use stream — stable event ordering and aborted-signal handling. Implementation: `server-handlers/claude-handler.mjs` |
| ADR-012 | `didWebSocketSetup = true` flag to block NextCustomServer's own upgrade listener | Prevents conflicts between Next 14's internal WebSocket setup and ClaudeGUI's `/ws/*` routing. Revalidate on a major Next upgrade. Implementation: `server.js` |
| ADR-013 | Singleton `/ws/files` and `/ws/claude` clients | Ensures a single WS connection is maintained even when multiple hooks on the page call in. `getFilesClient()`, `getClaudeClient()` — `src/lib/websocket/*-client.ts`. Connection status is unified in `useConnectionStore`. |
| ADR-014 | Line-based LCS diff with per-hunk partial acceptance | A pure JS LCS implementation instead of the Monaco DiffEditor API. Consistent server/client results, easy to test. Implementation: `src/lib/diff/line-diff.ts`, `toggleHunk`/`applyAcceptedHunks` in `src/stores/use-editor-store.ts` |
| ADR-015 | UI to edit `.claude/settings.json`'s `permissions.allow`/`deny` | `canUseTool` handles only user-prompt approval; persistent auto-approvals are configured via Claude Code's standard rules in `settings.json`. Parse/save: `src/lib/claude/settings-manager.ts` |
| ADR-016 | `ProjectContext` singleton for runtime project hot-swap | `PROJECT_ROOT`, previously frozen at boot, becomes runtime-switchable. `src/lib/project/project-context.mjs` is the single source of truth; the files/terminal/claude handlers and `resolveSafe` all call `getActiveRoot()`. On change: chokidar restarts and a `project-changed` event is broadcast over WS. State persists to `~/.claudegui/state.json`. |
| ADR-017 | HTML stream extractor (state machine) | Watches Claude assistant text for ` ```html ` fences and `Write`/`Edit` `tool_use` events, pushing partial HTML into a live preview store. A renderability heuristic (`<!doctype` or balanced tags) chooses iframe srcdoc vs. source-view fallback. Implementation: `src/lib/claude/html-stream-extractor.ts`, `src/stores/use-live-preview-store.ts`. |
| ADR-018 | Tauri v2 + Node sidecar native installer | Chosen over Electron: native webview + bundled Node.js sidecar running `server.js`. `.dmg`/`.msi` are 40–60 MB, and native ABIs like node-pty are rebuilt in CI against the bundled Node version. On first launch the app installs `@anthropic-ai/claude-code` into an app-local `node-prefix` and prepends its `bin` to the PTY `PATH`. Implementation: `installer/tauri/`, `scripts/installer-runtime/ensure-claude-cli.mjs`. |

## Related Documents

- [SRS](../srs/README.md) — requirements specification
- [Research documents](../../research/) — early planning documents
- [CLAUDE-EN.md](../../../CLAUDE-EN.md) — project conventions
