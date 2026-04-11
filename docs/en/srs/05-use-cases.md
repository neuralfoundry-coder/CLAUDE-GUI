# 5. Use Cases

> English mirror of [`docs/srs/05-use-cases.md`](../../srs/05-use-cases.md).

## UC-01: Open and explore a project

| Item | Value |
|------|-------|
| **Actor** | Developer |
| **Preconditions** | ClaudeGUI server running; project directory configured |
| **Related FR** | FR-200, FR-300, FR-900 |

### Main flow

1. The user opens ClaudeGUI in a browser.
2. The left-hand file explorer displays the project directory tree.
3. The user clicks a folder to expand its children.
4. Clicking a file opens it as a new tab in the center editor.
5. The editor displays the file content with syntax highlighting.

### Alternative flows

- **3a.** Use `Cmd+P` to search by file name for quick open.
- **4a.** If the file is already open, focus switches to the existing tab.
- **5a.** If the file is previewable (HTML, MD, PDF), it is also displayed in the right preview panel.

### Postconditions

- The selected file is open in an editor tab.
- The file is highlighted in the file explorer.

---

## UC-02: Ask Claude to modify code

| Item | Value |
|------|-------|
| **Actor** | Developer |
| **Preconditions** | Claude CLI authenticated; a Claude session is active |
| **Related FR** | FR-500, FR-300, FR-907 |

### Main flow

1. The user enters a natural-language instruction in the Claude input field.
   - e.g., "Add error handling to the `login` function."
2. The system sends the query to Claude via the Agent SDK.
3. Claude's streaming response is displayed in real time (typing effect).
4. Claude invokes a file-edit tool.
5. A permission-request modal appears (see FR-505, UC-03).
6. When the user approves, Claude modifies the file.
7. chokidar detects the file change and the editor reflects it.
8. The editor shows the changes as a diff view.
9. The user accepts or rejects the changes.
10. After the query completes, cost and token usage are displayed.

### Alternative flows

- **5a.** If an auto-approval rule matches, the modal is skipped.
- **7a.** If the editor has unsaved changes, a conflict notification is shown.
- **9a.** Partial acceptance — accept specific hunks while rejecting others.

### Postconditions

- Accepted changes are applied to the file.
- The conversation history is preserved in the Claude session.

---

## UC-03: Approve or deny a permission request

| Item | Value |
|------|-------|
| **Actor** | Developer |
| **Preconditions** | Claude has requested a tool invocation |
| **Related FR** | FR-505, FR-506 |

### Main flow

1. Claude requests a file write or a Bash command execution.
2. The system intercepts the permission request and shows a GUI modal.
3. The modal displays the tool name and the target path/command.
4. The user clicks **Approve**.
5. The system sends the approval back to the Agent SDK.
6. Claude executes the requested tool.

### Alternative flows

- **4a.** The user clicks **Deny** → a deny response is sent to Claude → Claude proposes an alternative.
- **2a.** If the request matches an entry in `.claude/settings.json`, it is auto-approved and marked with an "Auto-approved" badge.
- **3a.** Dangerous commands (rm -rf, system-file modifications, etc.) are highlighted with a warning icon.

### Postconditions

- The approval or denial result is recorded in the Claude session.
- If approved, the tool has finished executing.

---

## UC-04: Author and edit an HTML presentation

| Item | Value |
|------|-------|
| **Actor** | Developer |
| **Preconditions** | Claude session active |
| **Related FR** | FR-700, FR-600 |

### Main flow

1. The user asks Claude to create a presentation.
   - e.g., "Create a 5-slide deck introducing the project architecture."
2. Claude generates an HTML file in reveal.js format.
3. The right-hand preview panel renders the slides.
4. The user requests an edit in natural language.
   - e.g., "Add a sequence diagram to slide 3."
5. Claude modifies the HTML of that slide.
6. The iframe DOM is patched and `Reveal.sync()` is called.
7. The edited slide is reflected immediately, without an iframe reload.
8. The user requests a PPTX export.
9. PptxGenJS produces a `.pptx` file and it is downloaded.

### Alternative flows

- **3a.** Editing HTML/Markdown directly in the editor refreshes the preview in real time.
- **8a.** Choosing PDF export produces a PDF via DeckTape or `print-pdf`.
- **4a.** Clicking a specific slide in the preview scrolls the editor to its code (bidirectional sync).

### Postconditions

- The presentation file is saved in the project.
- The exported file (PPTX/PDF) has been downloaded.

---

## UC-05: Preview multi-format documents

| Item | Value |
|------|-------|
| **Actor** | Developer |
| **Preconditions** | A previewable file exists in the project |
| **Related FR** | FR-600 |

### Main flow

1. The user selects a file in the file explorer.
2. The system detects the file type from the extension.
3. The appropriate renderer loads into the preview panel.
   - `.html` → iframe srcdoc rendering
   - `.pdf` → react-pdf page view
   - `.md` → react-markdown rendering
   - `.png/.jpg` → image viewer (zoom/pan)
4. When the file is edited, the preview refreshes after a 300 ms debounce.

### Alternative flows

- **2a.** Unsupported file type → a "Preview not available" message is shown.
- **3a.** PDF: page navigation (previous/next, page jump).
- **4a.** HTML: if only CSS changed, styles are updated via `postMessage`.

### Postconditions

- The preview of the selected file is shown in the right panel.

---

## UC-06: Use the terminal directly

| Item | Value |
|------|-------|
| **Actor** | Developer |
| **Preconditions** | Terminal panel active |
| **Related FR** | FR-400 |

### Main flow

1. The user opens the terminal panel via `Cmd+J` (or by clicking).
2. The terminal starts a shell session in the project directory.
3. The user enters a command (e.g., `npm test`).
4. The command output is rendered in real time with ANSI color.
5. If the command modifies files, chokidar detects it and refreshes the editor/file tree.

### Alternative flows

- **2a.** Create additional terminal sessions (tabs or splits).
- **3a.** Entering the `claude` command runs the CLI directly in the terminal.
- **4a.** Heavy output activates backpressure control (50 MB limit).
- **5a.** `Ctrl+F` searches text within the terminal buffer.

### Postconditions

- Command output is visible in the terminal.
- Any file changes are reflected in the editor and file tree.

---

## UC-07: Manage sessions

| Item | Value |
|------|-------|
| **Actor** | Developer |
| **Preconditions** | ClaudeGUI server running |
| **Related FR** | FR-503, FR-504 |

### Main flow

1. The user opens the session management UI.
2. The existing session list is displayed (name, creation date, last use, cost).
3. The user selects an existing session to resume.
4. The previous conversation context is restored and work continues.

### Alternative flows

- **2a.** Clicking "New session" starts an empty session.
- **3a.** Fork session → branch from an existing session into a new conversation.
- **3b.** Rename session.
- **3c.** Delete session (after confirmation).

### Postconditions

- The selected session is active and ready to converse with Claude.

---

## UC-08: Customize the layout

| Item | Value |
|------|-------|
| **Actor** | Developer |
| **Preconditions** | ClaudeGUI is open |
| **Related FR** | FR-100 |

### Main flow

1. The user drags a panel border to change a panel's size.
2. The new size is applied immediately.
3. The layout state is saved automatically to `localStorage`.

### Alternative flows

- **1a.** `Cmd+B` toggles the sidebar (file explorer).
- **1b.** `Cmd+J` toggles the terminal panel.
- **1c.** The collapse button on the panel header collapses or expands a panel.
- **3a.** On browser reload, the saved layout is restored.

### Postconditions

- The adjusted layout is retained and displayed identically on the next visit.
