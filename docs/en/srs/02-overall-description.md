# 2. Overall Description

> English mirror of [`docs/srs/02-overall-description.md`](../../srs/02-overall-description.md).

## 2.1 Product Perspective

ClaudeGUI is a **web-based GUI wrapper** for the Anthropic Claude CLI. It preserves every CLI capability while adding a visual editing environment at the level of a professional IDE.

A traditional terminal-only workflow has several limits:

- File exploration relies on `ls`/`tree`
- A separate editor is needed to edit code
- Outputs like HTML/PDF/presentations cannot be visually verified
- Claude's progress is only observable as a text stream

ClaudeGUI removes those limits by providing an integrated environment for operating Claude from an **"agent management console"** perspective.

### Differences vs. similar projects

| Project | Difference |
|---------|-----------|
| **claudecodeui** (siteboon) | Basic WebSocket bridge. No multi-format preview, no presentation editing. |
| **claude-code-web** (vultuk) | CodeMirror-based. Below professional IDE level; no preview panel. |
| **code-server** | VS Code wrapper. No Claude CLI-specific integration. |
| **Bolt.new / bolt.diy** | WebContainer (WASM)-based. Cannot access the local file system directly. |

ClaudeGUI's key differentiators:
1. **Professional IDE + rich preview**: code editing and HTML/PDF/slide previews integrated in a single screen
2. **Conversational visual editing**: natural-language slide-edit requests to Claude are reflected live WYSIWYG
3. **Agent visibility**: stream-json parsing surfaces Claude's reasoning (current file, search queries, tool calls) in real time

## 2.2 Product Feature Summary

| # | Feature | SRS ref. |
|---|---------|----------|
| 1 | Four-panel layout (collapse/expand, resize) | FR-100 |
| 2 | File explorer (tree view, Git status, drag-and-drop) | FR-200 |
| 3 | Monaco code editor (multi-tab, AI diff, live sync) | FR-300 |
| 4 | Terminal emulation (ANSI, GPU acceleration, multi-session) | FR-400 |
| 5 | Claude CLI integration (Agent SDK, streaming, session management) | FR-500 |
| 6 | Multi-format preview (HTML, PDF, Markdown, image) | FR-600 |
| 7 | HTML presentations (reveal.js, conversational edit, export) | FR-700 |
| 8 | Command palette and keyboard shortcuts | FR-800 |
| 9 | File system API (CRUD, watch, sandboxing) | FR-900 |

## 2.3 User Characteristics

### Primary users

- **Software developers**: Claude Pro/Max/Team/Enterprise subscribers
- **Skill level**: intermediate or higher, comfortable with the CLI
- **Environment**: local development (macOS, Windows, Linux)

### User expectations

- VS Code-like keybindings and editing experience
- Instantly see Claude's results visually, without switching to the terminal
- Accept/reject Claude's file edits directly in the editor
- Edit non-code artifacts like presentations conversationally

## 2.4 Operating Environment

### Supported operating systems

- macOS 13 (Ventura) or later
- Windows 10 or later
- Ubuntu 20.04 LTS or later

### Required software

| Software | Minimum version | Notes |
|----------|-----------------|-------|
| Node.js | 20.0+ | chokidar v5 ESM support, node-pty build |
| Claude CLI | latest | `claude` command must be on `PATH` |
| npm | 10.0+ | package manager |
| Chrome | latest 2 versions | primary target browser |
| C++ build tools | — | node-pty native build (python3, make, g++) |

### Network

- Internet access to the Anthropic API is required
- The server binds to `localhost:3000` by default
- Use an SSH tunnel or Cloudflare Tunnel for remote access

## 2.5 Design and Implementation Constraints

1. **Custom server required**: a Next.js custom `server.js` is required for WebSocket support. Serverless platforms (Vercel, etc.) are not supported.
2. **node-pty native dependency**: requires a C++ compiler and Python 3 build environment.
3. **Single user**: not a multi-tenant architecture. Runs with the current OS user's privileges on the local machine.
4. **Claude CLI dependency**: core features require the Claude CLI to be installed.
5. **Bundle size**: Monaco Editor's 5–10 MB bundle forces a CDN loading strategy.

## 2.6 Assumptions and Dependencies

### Assumptions

- The user has already installed and authenticated the Claude CLI
- Node.js 20+ is available on the local machine
- C++ build tools are installed for native module builds
- Chrome is used as the browser

### External dependencies

- **Anthropic Claude Agent SDK**: assumed to maintain API stability and backward compatibility
- **Claude CLI**: assumed to continue supporting the `--output-format stream-json` option
- **npm packages**: assumed active maintenance of key dependencies (Monaco, xterm.js, reveal.js, etc.)
