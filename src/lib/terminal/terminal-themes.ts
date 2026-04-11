import type { ITheme } from '@xterm/xterm';
import type { Theme as AppTheme } from '@/stores/use-layout-store';

/**
 * xterm ITheme mapping for each ClaudeGUI app theme.
 *
 * WCAG AA: every chromatic ANSI color must clear a 4.5:1 contrast ratio
 * against `background`. The `black` entry intentionally maps to the app
 * background tone (that's the xterm convention) and is exempt. See
 * `tests/unit/terminal-themes-contrast.test.ts`.
 *
 * The `background`/`foreground` hex values MUST match the `--terminal-bg`
 * / `--terminal-fg` CSS variables in `src/app/globals.css`, so the xterm
 * host `<div>` does not flash a wrong color before WebGL paints.
 */
export const TERMINAL_THEMES: Record<AppTheme, ITheme> = {
  dark: {
    background: '#0a0a0a',
    foreground: '#e4e4e7',
    cursor: '#e4e4e7',
    cursorAccent: '#0a0a0a',
    selectionBackground: '#3f3f46',
    black: '#18181b',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#facc15',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#e4e4e7',
    // zinc-500 (#71717a) only hits ~4.1:1; bumped to ~5.9:1 so zsh
    // autosuggest / git dim text / ls dirs are actually readable.
    brightBlack: '#8b8b93',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fde047',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#fafafa',
  },
  light: {
    background: '#ffffff',
    foreground: '#18181b',
    cursor: '#18181b',
    cursorAccent: '#ffffff',
    selectionBackground: '#d4d4d8',
    black: '#27272a',
    // Tailwind 600-level pigments at ~3:1 on white fail AA. Bumped every
    // chromatic entry down a stop to 700/800-level so `ls --color`,
    // `git status`, and npm logs stay readable in light mode.
    red: '#b91c1c',
    green: '#166534',
    yellow: '#854d0e',
    blue: '#1d4ed8',
    magenta: '#7e22ce',
    cyan: '#155e75',
    // `white` as fg on a white bg is unusable. Remap to mid-zinc so apps
    // that emit `\e[37m` still print readable text, and let `brightWhite`
    // take over the foreground tone.
    white: '#52525b',
    brightBlack: '#52525b',
    brightRed: '#dc2626',
    brightGreen: '#15803d',
    brightYellow: '#a16207',
    brightBlue: '#2563eb',
    brightMagenta: '#9333ea',
    brightCyan: '#0e7490',
    brightWhite: '#18181b',
  },
  'high-contrast': {
    background: '#000000',
    foreground: '#ffffff',
    cursor: '#ffff00',
    cursorAccent: '#000000',
    selectionBackground: '#ffffff',
    black: '#000000',
    red: '#ff6060',
    green: '#00ff00',
    yellow: '#ffff00',
    blue: '#00b7ff',
    magenta: '#ff00ff',
    cyan: '#00ffff',
    white: '#ffffff',
    brightBlack: '#808080',
    brightRed: '#ff8787',
    brightGreen: '#87ff87',
    brightYellow: '#ffff87',
    brightBlue: '#87d7ff',
    brightMagenta: '#ff87ff',
    brightCyan: '#87ffff',
    brightWhite: '#ffffff',
  },
  'retro-green': {
    background: '#0b0f0a',
    foreground: '#33ff66',
    cursor: '#33ff66',
    cursorAccent: '#0b0f0a',
    selectionBackground: '#0f3f22',
    black: '#0b0f0a',
    red: '#ff6666',
    green: '#33ff66',
    yellow: '#bfff4d',
    blue: '#4dffbf',
    magenta: '#bfffbf',
    cyan: '#7fffbf',
    white: '#ccffcc',
    // #1a3320 was only ~1.4:1 on the retro-green bg — pushed lighter so
    // dim text remains legible while staying in the CRT palette.
    brightBlack: '#5a9a5a',
    brightRed: '#ff9999',
    brightGreen: '#66ff99',
    brightYellow: '#ccff66',
    brightBlue: '#66ffcc',
    brightMagenta: '#ccffcc',
    brightCyan: '#99ffcc',
    brightWhite: '#e6ffe6',
  },
};
