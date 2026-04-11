# 1. Introduction

> English mirror of [`docs/srs/01-introduction.md`](../../srs/01-introduction.md).

## 1.1 Purpose

This document defines the software requirements for the **ClaudeGUI** project. ClaudeGUI wraps Anthropic's Claude CLI inside a web-based IDE that overcomes the limits of a terminal and adds a visual editing environment.

Intended audience:
- Frontend and backend developers
- UI/UX designers
- QA engineers
- Project managers

## 1.2 Project Scope

### In scope

- Four-panel layout (file explorer, code editor, terminal, preview)
- Monaco Editor-based code editing (multi-tab, syntax highlighting)
- xterm.js-based terminal emulation
- CLI integration and real-time streaming via the Claude Agent SDK
- Multi-format live preview (HTML, PDF, Markdown, images, presentations)
- HTML presentation authoring and conversational editing via reveal.js
- Permission-request interception with GUI approve/deny
- Session management (create, resume, fork)
- Command palette and keyboard shortcuts

### Out of scope

- Multi-user / multi-tenant support
- Cloud SaaS deployment (local-only)
- Modifying or extending the Claude CLI itself
- Native mobile apps
- LSP (Language Server Protocol) integration (considered post-1.0)

## 1.3 Definitions and Acronyms

| Term | Definition |
|------|-----------|
| **Agent SDK** | `@anthropic-ai/claude-agent-sdk` — the official Anthropic SDK for programmatic control of the Claude CLI |
| **NDJSON** | Newline-Delimited JSON — a JSON streaming format separated by line breaks |
| **PTY** | Pseudo-Terminal — a virtual terminal device used for terminal emulation |
| **MCP** | Model Context Protocol — a protocol for connecting to external tools |
| **WebSocket** | A full-duplex bidirectional communication protocol between browser and server |
| **SSR** | Server-Side Rendering — HTML generated on the server and sent to the client |
| **CSR** | Client-Side Rendering — UI rendered in the browser via JavaScript |
| **srcdoc** | An iframe attribute that embeds HTML content inline |
| **reveal.js** | An HTML-based presentation framework (70k+ GitHub stars) |
| **Monaco** | The core editor engine behind VS Code |
| **xterm.js** | A browser-based terminal emulator library |
| **@parcel/watcher** | A cross-platform file system watcher backed by native FSEvents / inotify / ReadDirectoryChangesW (adopted by ClaudeGUI in place of chokidar v5 — see ADR-024) |
| **node-pty** | Node.js pseudo-terminal bindings, maintained by Microsoft |
| **Zustand** | A lightweight React state management library |

## 1.4 Reference Documents

### Internal

- [Claude GUI: Development Plan for a Web-Based IDE Wrapping Claude CLI](../../research/Claude%20GUI_%20Development%20Plan%20for%20a%20Web-Based%20IDE%20Wrapping%20Claude%20CLI.md)
- [Claude CLI GUI 개발 계획서](../../research/Claude%20CLI%20GUI%20개발%20계획서.md)
- [Web-based AI Editor System Report](../../research/이%20보고서는%20Anthropic%20Claude%20CLI를%20기반으로%20한%20웹%20기반%20AI%20에디터%20시스템.md)

### External

- Anthropic Claude Code official documentation
- Claude Agent SDK API reference
- Next.js 14+ App Router documentation
- Monaco Editor API documentation
- xterm.js API documentation

## 1.5 Overview

This SRS follows IEEE 830 with the following structure:

- **Ch. 2 Overall Description**: product perspective, user characteristics, operating environment, constraints
- **Ch. 3 Functional Requirements**: detailed specifications across 9 categories (FR-100~FR-900)
- **Ch. 4 Non-Functional Requirements**: performance, security, usability, compatibility, maintainability
- **Ch. 5 Use Cases**: 8 primary scenarios
- **Ch. 6 External Interfaces**: UI, software, communication, and hardware interfaces
- **Ch. 7 Constraints and Assumptions**: technical and business constraints plus dependencies
