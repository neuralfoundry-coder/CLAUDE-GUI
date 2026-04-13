import path from 'node:path';

export type Platform = 'darwin' | 'win32' | 'linux' | 'openbsd' | 'freebsd' | 'netbsd';

export interface LauncherInput {
  platform: NodeJS.Platform;
  cwd: string;
  /** Subset of `process.env`; tests pass plain objects so we don't require NODE_ENV. */
  env: Record<string, string | undefined>;
  /** Predicate used to detect optional terminal apps on disk or PATH. */
  exists: (p: string) => boolean;
}

export interface Launcher {
  cmd: string;
  args: string[];
  /** Human-readable name for error messages (e.g., "Terminal.app"). */
  label: string;
}

export class NoLauncherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoLauncherError';
  }
}

/**
 * User-facing env var that forces a specific terminal app. On macOS the
 * value is passed to `open -a <value>` (so `CLAUDEGUI_EXTERNAL_TERMINAL=iTerm`
 * works). On Linux it's treated as a binary name looked up on PATH.
 */
const ENV_OVERRIDE = 'CLAUDEGUI_EXTERNAL_TERMINAL';

/**
 * Linux terminal emulators we know how to drive, in preference order.
 * Each entry describes how to pass cwd — some use `--working-directory=`,
 * others `-d`, and `xterm` needs an explicit shell invocation.
 */
interface LinuxLauncher {
  bin: string;
  argsFor: (cwd: string, shell: string) => string[];
}

const LINUX_LAUNCHERS: LinuxLauncher[] = [
  { bin: 'x-terminal-emulator', argsFor: (cwd) => ['--working-directory', cwd] },
  { bin: 'gnome-terminal', argsFor: (cwd) => [`--working-directory=${cwd}`] },
  { bin: 'konsole', argsFor: (cwd) => ['--workdir', cwd] },
  { bin: 'xfce4-terminal', argsFor: (cwd) => [`--working-directory=${cwd}`] },
  { bin: 'tilix', argsFor: (cwd) => ['--working-directory', cwd] },
  { bin: 'alacritty', argsFor: (cwd) => ['--working-directory', cwd] },
  { bin: 'kitty', argsFor: (cwd) => ['-d', cwd] },
  { bin: 'wezterm', argsFor: (cwd) => ['start', '--cwd', cwd] },
  { bin: 'foot', argsFor: (cwd) => ['--working-directory', cwd] },
  { bin: 'rio', argsFor: (cwd) => ['--working-dir', cwd] },
  {
    bin: 'xterm',
    // xterm has no cwd flag — cd via a shell invocation.
    argsFor: (cwd, shell) => ['-e', `cd ${shellEscape(cwd)} && exec ${shell}`],
  },
];

function shellEscape(s: string): string {
  // Minimal POSIX shell escaping: single-quote and escape embedded quotes.
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function resolveLauncher(input: LauncherInput): Launcher {
  const { platform, cwd, env, exists } = input;
  const override = env[ENV_OVERRIDE]?.trim();

  if (platform === 'darwin') {
    // For known terminals, use AppleScript to reliably set the working
    // directory. `open -na <app> <path>` passes cwd as a "file to open"
    // which works inconsistently across terminal emulators.
    if (override) {
      // Unknown override app — best-effort via `open -na`.
      return { cmd: 'open', args: ['-na', override, cwd], label: override };
    }
    const escaped = shellEscape(cwd);
    if (exists('/Applications/iTerm.app')) {
      return {
        cmd: 'osascript',
        args: [
          '-e',
          `tell application "iTerm2" to create window with default profile command "cd ${escaped} && exec $SHELL"`,
        ],
        label: 'iTerm',
      };
    }
    return {
      cmd: 'osascript',
      args: [
        '-e',
        `tell application "Terminal" to do script "cd ${escaped} && clear"`,
      ],
      label: 'Terminal',
    };
  }

  if (platform === 'win32') {
    // Prefer Windows Terminal (`wt.exe`) if present. Fall back to `cmd`.
    // `wt -d <cwd>` opens a new tab in the current window or a new window.
    const localAppData = env.LOCALAPPDATA;
    const wtPath = localAppData
      ? path.join(localAppData, 'Microsoft', 'WindowsApps', 'wt.exe')
      : null;
    if (override) {
      // Treat override as an absolute path or a bare command name.
      return { cmd: override, args: ['-d', cwd], label: override };
    }
    if (wtPath && exists(wtPath)) {
      return { cmd: wtPath, args: ['-d', cwd], label: 'Windows Terminal' };
    }
    // Fall back: spawn cmd.exe in the target directory. `start ""` opens a
    // new window; `/K` keeps it open; `cd /d` switches drive+dir.
    return {
      cmd: 'cmd.exe',
      args: ['/c', 'start', '""', 'cmd.exe', '/K', `cd /d ${cwd}`],
      label: 'cmd.exe',
    };
  }

  // Linux + BSDs. Walk the priority list: override → $TERMINAL → known bins.
  const shell = env.SHELL || '/bin/sh';

  const tryBin = (bin: string): Launcher | null => {
    const launcher = LINUX_LAUNCHERS.find((l) => l.bin === bin);
    if (launcher) {
      if (!exists(bin)) return null;
      return { cmd: bin, args: launcher.argsFor(cwd, shell), label: bin };
    }
    // Unknown bin — still honor it, but pass only cwd as arg with no flag.
    // Most emulators respect `--working-directory=` or `-d`; unknown ones
    // fall back to `cd && exec shell`.
    if (!exists(bin)) return null;
    return {
      cmd: bin,
      args: ['-e', `cd ${shellEscape(cwd)} && exec ${shell}`],
      label: bin,
    };
  };

  if (override) {
    const l = tryBin(override);
    if (l) return l;
    throw new NoLauncherError(
      `${ENV_OVERRIDE}="${override}" but that binary was not found on PATH`,
    );
  }

  const termEnv = env.TERMINAL?.trim();
  if (termEnv) {
    const l = tryBin(termEnv);
    if (l) return l;
    // $TERMINAL set but missing — fall through to defaults rather than
    // failing outright.
  }

  for (const launcher of LINUX_LAUNCHERS) {
    if (exists(launcher.bin)) {
      return {
        cmd: launcher.bin,
        args: launcher.argsFor(cwd, shell),
        label: launcher.bin,
      };
    }
  }

  throw new NoLauncherError(
    'No supported terminal emulator found. Set CLAUDEGUI_EXTERNAL_TERMINAL to override.',
  );
}
