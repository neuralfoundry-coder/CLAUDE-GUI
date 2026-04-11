'use client';

import { useLayoutStore } from '@/stores/use-layout-store';
import { useArtifactStore } from '@/stores/use-artifact-store';
import { useTerminalStore } from '@/stores/use-terminal-store';
import { terminalManager } from '@/lib/terminal/terminal-manager';
import { getActiveEditorSelectionOrLine } from '@/components/panels/editor/monaco-editor-wrapper';
import { useKeyboardShortcut, isFocusInsideTerminal } from './use-keyboard-shortcut';

export function useGlobalShortcuts(): void {
  const increaseFontSize = useLayoutStore((s) => s.increaseFontSize);
  const decreaseFontSize = useLayoutStore((s) => s.decreaseFontSize);
  const toggleArtifacts = useArtifactStore((s) => s.toggle);

  useKeyboardShortcut([
    { key: '=', meta: true, ctrl: true, handler: () => increaseFontSize() },
    { key: '+', meta: true, ctrl: true, handler: () => increaseFontSize() },
    { key: '-', meta: true, ctrl: true, handler: () => decreaseFontSize() },
    { key: 'a', meta: true, ctrl: true, shift: true, handler: () => toggleArtifacts() },

    // ── Terminal shortcuts (only when focus is inside the terminal panel) ──
    {
      key: 't',
      meta: true,
      ctrl: true,
      when: isFocusInsideTerminal,
      handler: () => useTerminalStore.getState().createSession(),
    },
    {
      key: 'w',
      meta: true,
      ctrl: true,
      when: isFocusInsideTerminal,
      handler: () => useTerminalStore.getState().closeActiveSession(),
    },
    {
      key: 'f',
      meta: true,
      ctrl: true,
      when: isFocusInsideTerminal,
      handler: () => useTerminalStore.getState().toggleSearchOverlay(),
    },
    {
      key: 'k',
      meta: true,
      ctrl: true,
      when: isFocusInsideTerminal,
      handler: () => useTerminalStore.getState().clearActiveBuffer(),
    },
    {
      key: 'r',
      meta: true,
      ctrl: true,
      shift: true,
      when: isFocusInsideTerminal,
      handler: () => useTerminalStore.getState().restartActiveSession(),
    },
    {
      key: 'Tab',
      ctrl: true,
      when: isFocusInsideTerminal,
      handler: () => useTerminalStore.getState().nextTab(),
    },
    {
      key: 'Tab',
      ctrl: true,
      shift: true,
      when: isFocusInsideTerminal,
      handler: () => useTerminalStore.getState().prevTab(),
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      key: String(i + 1),
      meta: true,
      ctrl: true,
      when: isFocusInsideTerminal,
      handler: () => useTerminalStore.getState().activateTabByIndex(i),
    })),

    // Cmd+D — toggle 2-pane split.
    {
      key: 'd',
      meta: true,
      ctrl: true,
      when: isFocusInsideTerminal,
      handler: () => useTerminalStore.getState().toggleSplit(),
    },
    // Cmd+] / Cmd+[ — cycle focus between panes.
    {
      key: ']',
      meta: true,
      ctrl: true,
      when: isFocusInsideTerminal,
      handler: () => {
        const s = useTerminalStore.getState();
        if (!s.splitEnabled) return;
        s.focusPane(s.activePaneIndex === 0 ? 1 : 0);
      },
    },
    {
      key: '[',
      meta: true,
      ctrl: true,
      when: isFocusInsideTerminal,
      handler: () => {
        const s = useTerminalStore.getState();
        if (!s.splitEnabled) return;
        s.focusPane(s.activePaneIndex === 0 ? 1 : 0);
      },
    },

    // Cmd/Ctrl+Shift+Enter — send editor selection (or current line) to the
    // active terminal. Stays in the editor; terminal receives input but does
    // not steal focus.
    {
      key: 'Enter',
      meta: true,
      ctrl: true,
      shift: true,
      handler: () => {
        const text = getActiveEditorSelectionOrLine();
        if (!text) return;
        const { activeSessionId } = useTerminalStore.getState();
        if (!activeSessionId) return;
        // Ensure the payload ends with a newline so the shell executes it.
        const payload = text.endsWith('\n') ? text : text + '\n';
        terminalManager.paste(activeSessionId, payload);
      },
    },
  ]);
}
