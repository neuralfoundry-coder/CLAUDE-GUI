import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
// @ts-expect-error — .mjs resolver has no .d.ts; runtime import only.
import { resolveShell, shellFlags, buildPtyEnv } from '../../server-handlers/terminal/shell-resolver.mjs';

const EXISTING_SHELLS = new Set<string>([
  '/bin/zsh',
  '/bin/bash',
  '/bin/sh',
  '/opt/homebrew/bin/fish',
  '/usr/bin/env',
  'C:\\Windows\\System32\\cmd.exe',
  'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
]);

beforeEach(() => {
  vi.spyOn(fs, 'statSync').mockImplementation((p: fs.PathLike) => {
    const s = typeof p === 'string' ? p : p.toString();
    if (EXISTING_SHELLS.has(s)) {
      return { isFile: () => true } as fs.Stats;
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shellFlags', () => {
  it('returns -l -i for zsh/bash/fish/sh', () => {
    expect(shellFlags('/bin/zsh')).toEqual(['-l', '-i']);
    expect(shellFlags('/bin/bash')).toEqual(['-l', '-i']);
    expect(shellFlags('/opt/homebrew/bin/fish')).toEqual(['-l', '-i']);
    expect(shellFlags('/bin/sh')).toEqual(['-l', '-i']);
  });

  it('returns -NoLogo for pwsh/powershell', () => {
    expect(shellFlags('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toEqual(['-NoLogo']);
    expect(shellFlags('powershell.exe')).toEqual(['-NoLogo']);
  });

  it('returns empty args for cmd.exe', () => {
    expect(shellFlags('C:\\Windows\\System32\\cmd.exe')).toEqual([]);
    expect(shellFlags('cmd.exe')).toEqual([]);
  });

  it('defaults to POSIX login-interactive for unknown shells on posix', () => {
    const prev = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      expect(shellFlags('/opt/local/bin/nushell')).toEqual(['-l', '-i']);
    } finally {
      if (prev) Object.defineProperty(process, 'platform', prev);
    }
  });
});

describe('resolveShell', () => {
  it('prefers CLAUDEGUI_SHELL when it exists', () => {
    const result = resolveShell(
      { CLAUDEGUI_SHELL: '/opt/homebrew/bin/fish', SHELL: '/bin/zsh' },
      'darwin',
    );
    expect(result.shell).toBe('/opt/homebrew/bin/fish');
    expect(result.args).toEqual(['-l', '-i']);
  });

  it('ignores CLAUDEGUI_SHELL when the path does not exist', () => {
    const result = resolveShell(
      { CLAUDEGUI_SHELL: '/does/not/exist', SHELL: '/bin/zsh' },
      'darwin',
    );
    expect(result.shell).toBe('/bin/zsh');
  });

  it('falls back to $SHELL on posix', () => {
    const result = resolveShell({ SHELL: '/bin/bash' }, 'linux');
    expect(result.shell).toBe('/bin/bash');
    expect(result.args).toEqual(['-l', '-i']);
  });

  it('falls back to /bin/zsh then /bin/bash then /bin/sh on posix when $SHELL missing', () => {
    const result = resolveShell({}, 'darwin');
    expect(result.shell).toBe('/bin/zsh');
  });

  it('uses COMSPEC on windows', () => {
    const result = resolveShell(
      { COMSPEC: 'C:\\Windows\\System32\\cmd.exe' },
      'win32',
    );
    expect(result.shell).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(result.args).toEqual([]);
  });
});

describe('buildPtyEnv', () => {
  it('sets TERM, COLORTERM, TERM_PROGRAM', () => {
    const env = buildPtyEnv('/bin/zsh', { PATH: '/usr/bin' }, 'darwin');
    expect(env.TERM).toBe('xterm-256color');
    expect(env.COLORTERM).toBe('truecolor');
    expect(env.TERM_PROGRAM).toBe('ClaudeGUI');
    expect(typeof env.TERM_PROGRAM_VERSION).toBe('string');
  });

  it('defaults LANG to en_US.UTF-8 on posix when not set', () => {
    const env = buildPtyEnv('/bin/zsh', { PATH: '/usr/bin' }, 'darwin');
    expect(env.LANG).toBe('en_US.UTF-8');
  });

  it('preserves user LANG', () => {
    const env = buildPtyEnv('/bin/zsh', { PATH: '/usr/bin', LANG: 'ko_KR.UTF-8' }, 'darwin');
    expect(env.LANG).toBe('ko_KR.UTF-8');
  });

  it('strips NODE_OPTIONS and Next.js leak vars', () => {
    const env = buildPtyEnv(
      '/bin/zsh',
      {
        PATH: '/usr/bin',
        NODE_OPTIONS: '--max-old-space-size=4096',
        NEXT_TELEMETRY_DISABLED: '1',
        ELECTRON_RUN_AS_NODE: '1',
      },
      'darwin',
    );
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.NEXT_TELEMETRY_DISABLED).toBeUndefined();
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

  it('prepends CLAUDEGUI_EXTRA_PATH', () => {
    const env = buildPtyEnv(
      '/bin/zsh',
      { PATH: '/usr/bin', CLAUDEGUI_EXTRA_PATH: '/opt/custom/bin' },
      'darwin',
    );
    expect(env.PATH).toBe('/opt/custom/bin:/usr/bin');
  });

  it('uses ; separator for CLAUDEGUI_EXTRA_PATH on windows', () => {
    const env = buildPtyEnv(
      'cmd.exe',
      { PATH: 'C:\\Windows', CLAUDEGUI_EXTRA_PATH: 'C:\\Tools' },
      'win32',
    );
    expect(env.PATH).toBe('C:\\Tools;C:\\Windows');
  });

  it('sets CLAUDEGUI_PTY=1 hint', () => {
    const env = buildPtyEnv('/bin/zsh', { PATH: '/usr/bin' }, 'darwin');
    expect(env.CLAUDEGUI_PTY).toBe('1');
  });
});
