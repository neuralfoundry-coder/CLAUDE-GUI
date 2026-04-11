# Terminal Smoke Matrix

> Manual verification checklist that complements the automated unit and E2E
> suites. Run this every time `server-handlers/terminal-handler.mjs`,
> `server-handlers/terminal/shell-resolver.mjs`, or
> `src/lib/terminal/*` is touched.

## Shell initialization (FR-410)

| Platform + shell | Check | Expected |
|---|---|---|
| macOS + zsh | `echo $SHELL $TERM $TERM_PROGRAM` | `/bin/zsh xterm-256color ClaudeGUI` |
| macOS + zsh | `which claude` | resolves via user dotfile PATH (homebrew or nvm) |
| macOS + zsh | `echo $PATH` | contains `/opt/homebrew/bin` or `/usr/local/bin` as sourced by `.zprofile` |
| macOS + zsh | aliases defined in `~/.zshrc` | available (e.g. `alias`, tab completion) |
| macOS + bash (via `CLAUDEGUI_SHELL=/bin/bash`) | `echo $BASH_VERSION` | non-empty |
| macOS + bash | `.bash_profile` aliases | available |
| Linux + bash | `which claude`, `echo $PATH` | sources `.bashrc` correctly |
| Windows + pwsh (via `CLAUDEGUI_SHELL=pwsh.exe`) | `Get-Location`, `$PROFILE` | profile loaded |
| Any | `env | grep CLAUDEGUI` | shows `CLAUDEGUI_PTY=1` and `CLAUDEGUI_SHELL_PATH=<resolved>` |

## Session durability (FR-408 / FR-411)

- [ ] Open tab, type `exit` — tab transitions to `exited`, red indicator, Restart chip visible.
- [ ] Click Restart — new shell launches, separator `─── restarted at HH:MM:SS ───` visible, previous scrollback retained.
- [ ] Open tab, kill `node server.js` — tab transitions to `closed` with grey indicator and `[connection to PTY lost]` marker line.
- [ ] Restart `node server.js`, click Restart on the tab — new shell launches, same session ID.
- [ ] Press `Cmd/Ctrl+Shift+R` with a live shell — no-op (only runs on `closed`/`exited`).

## Search (FR-405)

- [ ] `Cmd/Ctrl+F` opens the overlay at top-right. Input is focused.
- [ ] Type a query — matches are highlighted after ~100 ms.
- [ ] Enter → next, Shift+Enter → previous.
- [ ] Toggle `Aa` / `W` / `.*` and verify the match set updates.
- [ ] Esc closes the overlay, decorations clear, focus returns to xterm (you can type immediately).
- [ ] With ~10k lines in scrollback, queries remain responsive.

## Keyboard shortcuts (FR-806)

- [ ] `Cmd/Ctrl+T` opens a new tab. Tab counter increments.
- [ ] `Cmd/Ctrl+W` closes the active tab. Active switches to the last remaining tab.
- [ ] `Cmd/Ctrl+1..9` activates tab N (1-indexed).
- [ ] `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle forward / backward.
- [ ] `Cmd/Ctrl+K` while terminal focused clears the active buffer (Command Palette does NOT open).
- [ ] `Cmd/Ctrl+K` while editor/sidebar focused opens the Command Palette as before.
- [ ] None of the reserved combos appear as shell input.

## Clipboard / paste (FR-412)

- [ ] Right-click host → Copy disabled when no selection.
- [ ] Select text with mouse → Copy enabled → click → content is in system clipboard.
- [ ] Right-click → Paste → clipboard content arrives in the shell with bracketed-paste markers intact (zsh / vim).
- [ ] Paste 2 MB text file into `cat > /tmp/x` and verify byte count matches.
- [ ] Paste > 10 MB → confirmation prompt appears; accept → chunked delivery; cancel → no data sent.

## Tab metadata (FR-413)

- [ ] Double-click a tab label → inline input appears, text pre-selected.
- [ ] Type new name + Enter → name persists.
- [ ] Double-click + Esc → name unchanged.
- [ ] `cd /tmp` in a shell → tab label updates to `… · tmp`.
- [ ] `cd` to a path with a 25+ character basename → label shows truncated + ellipsis; tooltip shows full path.
- [ ] OSC 7 helper injection line (one visible line on first prompt) is acceptable — document in release notes.

## Project change banner (FR-413)

- [ ] Open 2 tabs, `cd /tmp` in one.
- [ ] Switch the active project via Project Picker to a different directory.
- [ ] Banner appears at the top of the terminal panel citing the new root.
- [ ] Click "Open new tab here" → new tab launches in the new root.
- [ ] Click Dismiss → banner hides.
- [ ] Switch project root again → banner re-appears (dismiss was scoped to the previous root).
