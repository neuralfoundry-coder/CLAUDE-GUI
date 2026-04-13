import { describe, it, expect } from 'vitest';
import {
  resolveLauncher,
  NoLauncherError,
} from '../../src/app/api/terminal/open-native/launchers';

/**
 * resolveLauncher is a pure function taking (platform, cwd, env, exists)
 * so we don't need to stub child_process or fs. Each case asserts that
 * the correct (cmd, args) pair comes out for a given environment.
 */

function withoutItermInstalled(_: string): boolean {
  return false;
}

describe('resolveLauncher — macOS', () => {
  it('defaults to Terminal.app via AppleScript when iTerm is not installed', () => {
    const launcher = resolveLauncher({
      platform: 'darwin',
      cwd: '/Users/k/proj',
      env: {},
      exists: withoutItermInstalled,
    });
    expect(launcher.cmd).toBe('osascript');
    expect(launcher.args[0]).toBe('-e');
    expect(launcher.args[1]).toContain('Terminal');
    expect(launcher.args[1]).toContain('/Users/k/proj');
    expect(launcher.label).toBe('Terminal');
  });

  it('prefers iTerm via AppleScript when /Applications/iTerm.app exists', () => {
    const launcher = resolveLauncher({
      platform: 'darwin',
      cwd: '/Users/k/proj',
      env: {},
      exists: (p) => p === '/Applications/iTerm.app',
    });
    expect(launcher.cmd).toBe('osascript');
    expect(launcher.args[1]).toContain('iTerm2');
    expect(launcher.args[1]).toContain('/Users/k/proj');
    expect(launcher.label).toBe('iTerm');
  });

  it('honors CLAUDEGUI_EXTERNAL_TERMINAL override via open -na', () => {
    const launcher = resolveLauncher({
      platform: 'darwin',
      cwd: '/tmp',
      env: { CLAUDEGUI_EXTERNAL_TERMINAL: 'Alacritty' },
      exists: () => true,
    });
    expect(launcher.cmd).toBe('open');
    expect(launcher.args).toEqual(['-na', 'Alacritty', '/tmp']);
    expect(launcher.label).toBe('Alacritty');
  });
});

describe('resolveLauncher — Windows', () => {
  it('uses wt.exe when it exists under LOCALAPPDATA', () => {
    const launcher = resolveLauncher({
      platform: 'win32',
      cwd: 'C:\\proj',
      env: { LOCALAPPDATA: 'C:\\Users\\k\\AppData\\Local' },
      exists: (p) => p.endsWith('wt.exe'),
    });
    expect(launcher.cmd.endsWith('wt.exe')).toBe(true);
    expect(launcher.args).toEqual(['-d', 'C:\\proj']);
    expect(launcher.label).toBe('Windows Terminal');
  });

  it('falls back to cmd.exe when wt.exe is missing', () => {
    const launcher = resolveLauncher({
      platform: 'win32',
      cwd: 'C:\\proj',
      env: { LOCALAPPDATA: 'C:\\Users\\k\\AppData\\Local' },
      exists: () => false,
    });
    expect(launcher.cmd).toBe('cmd.exe');
    expect(launcher.args[0]).toBe('/c');
    expect(launcher.args).toContain('start');
    expect(launcher.args.join(' ')).toContain('cd /d C:\\proj');
  });

  it('honors override by routing through it with -d', () => {
    const launcher = resolveLauncher({
      platform: 'win32',
      cwd: 'D:\\code',
      env: { CLAUDEGUI_EXTERNAL_TERMINAL: 'C:\\bin\\alacritty.exe' },
      exists: () => false,
    });
    expect(launcher.cmd).toBe('C:\\bin\\alacritty.exe');
    expect(launcher.args).toEqual(['-d', 'D:\\code']);
  });
});

describe('resolveLauncher — Linux', () => {
  it('prefers x-terminal-emulator when available', () => {
    const launcher = resolveLauncher({
      platform: 'linux',
      cwd: '/home/k/proj',
      env: {},
      exists: (p) => p === 'x-terminal-emulator',
    });
    expect(launcher.cmd).toBe('x-terminal-emulator');
    expect(launcher.args).toEqual(['--working-directory', '/home/k/proj']);
  });

  it('falls back to gnome-terminal when x-terminal-emulator is missing', () => {
    const launcher = resolveLauncher({
      platform: 'linux',
      cwd: '/home/k/proj',
      env: {},
      exists: (p) => p === 'gnome-terminal',
    });
    expect(launcher.cmd).toBe('gnome-terminal');
    expect(launcher.args).toEqual(['--working-directory=/home/k/proj']);
  });

  it('uses kitty with -d flag', () => {
    const launcher = resolveLauncher({
      platform: 'linux',
      cwd: '/tmp',
      env: {},
      exists: (p) => p === 'kitty',
    });
    expect(launcher.cmd).toBe('kitty');
    expect(launcher.args).toEqual(['-d', '/tmp']);
  });

  it('uses xterm as last resort with cd && exec shell', () => {
    const launcher = resolveLauncher({
      platform: 'linux',
      cwd: "/tmp/with space",
      env: { SHELL: '/bin/zsh' },
      exists: (p) => p === 'xterm',
    });
    expect(launcher.cmd).toBe('xterm');
    expect(launcher.args[0]).toBe('-e');
    // cwd must be single-quote escaped so spaces do not break the shell invocation.
    expect(launcher.args[1]).toBe("cd '/tmp/with space' && exec /bin/zsh");
  });

  it('honors $TERMINAL when the binary exists on PATH', () => {
    const launcher = resolveLauncher({
      platform: 'linux',
      cwd: '/proj',
      env: { TERMINAL: 'alacritty' },
      exists: (p) => p === 'alacritty',
    });
    expect(launcher.cmd).toBe('alacritty');
    expect(launcher.args).toEqual(['--working-directory', '/proj']);
  });

  it('honors CLAUDEGUI_EXTERNAL_TERMINAL when it exists', () => {
    const launcher = resolveLauncher({
      platform: 'linux',
      cwd: '/proj',
      env: { CLAUDEGUI_EXTERNAL_TERMINAL: 'wezterm' },
      exists: (p) => p === 'wezterm',
    });
    expect(launcher.cmd).toBe('wezterm');
    expect(launcher.args).toEqual(['start', '--cwd', '/proj']);
  });

  it('throws NoLauncherError when override binary is missing', () => {
    expect(() =>
      resolveLauncher({
        platform: 'linux',
        cwd: '/proj',
        env: { CLAUDEGUI_EXTERNAL_TERMINAL: 'nonexistent' },
        exists: () => false,
      }),
    ).toThrow(NoLauncherError);
  });

  it('throws NoLauncherError when nothing is installed', () => {
    expect(() =>
      resolveLauncher({
        platform: 'linux',
        cwd: '/proj',
        env: {},
        exists: () => false,
      }),
    ).toThrow(NoLauncherError);
  });

  it('falls through to defaults when $TERMINAL is set but missing', () => {
    const launcher = resolveLauncher({
      platform: 'linux',
      cwd: '/proj',
      env: { TERMINAL: 'notinstalled' },
      exists: (p) => p === 'gnome-terminal',
    });
    expect(launcher.cmd).toBe('gnome-terminal');
  });
});
