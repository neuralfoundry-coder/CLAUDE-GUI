import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TERMINAL_THEMES } from '../../src/lib/terminal/terminal-themes';

/**
 * sRGB relative luminance per WCAG 2.1.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const L1 = Math.max(a, b);
  const L2 = Math.min(a, b);
  return (L1 + 0.05) / (L2 + 0.05);
}

/**
 * ANSI color slots that must be readable as foreground-on-background.
 * `black` is intentionally excluded: by xterm convention it maps to the
 * app background tone (so `\e[30m` on a dark theme looks like "dark text")
 * and cannot satisfy contrast against the same background. `cursor` and
 * `selectionBackground` are excluded because they render as inverted
 * overlays, not as foreground text.
 */
const CONTRAST_SLOTS = [
  'foreground',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const;

const MIN_CONTRAST = 4.5; // WCAG AA body text

describe('TERMINAL_THEMES — WCAG AA contrast', () => {
  for (const [themeName, theme] of Object.entries(TERMINAL_THEMES)) {
    const bg = theme.background!;
    describe(themeName, () => {
      for (const slot of CONTRAST_SLOTS) {
        const fg = (theme as Record<string, string | undefined>)[slot];
        it(`${slot} (${fg}) on bg ${bg} ≥ ${MIN_CONTRAST}:1`, () => {
          expect(fg).toBeDefined();
          const ratio = contrast(fg!, bg);
          expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
        });
      }
    });
  }
});

describe('TERMINAL_THEMES ↔ globals.css parity', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../../src/app/globals.css'),
    'utf8',
  );

  // Find each theme block and the --terminal-bg/--terminal-fg it declares.
  // Each block is either `:root` (light), `.dark`, `.high-contrast`, or
  // `.retro-green`. We match the selector, then the first `--terminal-bg`
  // and `--terminal-fg` that appear before the closing brace.
  const blockPattern = /(:root|\.dark|\.high-contrast|\.retro-green)\s*\{([^}]*)\}/g;

  const selectorToTheme: Record<string, keyof typeof TERMINAL_THEMES> = {
    ':root': 'light',
    '.dark': 'dark',
    '.high-contrast': 'high-contrast',
    '.retro-green': 'retro-green',
  };

  const found = new Map<string, { bg: string; fg: string }>();
  for (const match of css.matchAll(blockPattern)) {
    const selector = match[1]!;
    const body = match[2]!;
    const bgMatch = body.match(/--terminal-bg:\s*(#[0-9a-fA-F]{6})/);
    const fgMatch = body.match(/--terminal-fg:\s*(#[0-9a-fA-F]{6})/);
    if (bgMatch && fgMatch) {
      found.set(selector, { bg: bgMatch[1]!.toLowerCase(), fg: fgMatch[1]!.toLowerCase() });
    }
  }

  for (const [selector, themeName] of Object.entries(selectorToTheme)) {
    it(`${selector} (${themeName}) matches TERMINAL_THEMES.${themeName}`, () => {
      const css = found.get(selector);
      expect(css, `missing --terminal-bg/--terminal-fg for ${selector}`).toBeDefined();
      const theme = TERMINAL_THEMES[themeName];
      expect(css!.bg).toBe(theme.background!.toLowerCase());
      expect(css!.fg).toBe(theme.foreground!.toLowerCase());
    });
  }
});
