import fs from 'node:fs';
import os from 'node:os';

const POSIX_LOGIN_INTERACTIVE = Object.freeze(['-l', '-i']);
const PWSH_FLAGS = Object.freeze(['-NoLogo']);
const CMD_FLAGS = Object.freeze([]);

function normalizeBasename(shellPath) {
  // Handle both POSIX and Windows separators regardless of host platform so
  // that unit tests running on darwin/linux can still reason about "cmd.exe".
  const lastSlash = Math.max(shellPath.lastIndexOf('/'), shellPath.lastIndexOf('\\'));
  const base = (lastSlash >= 0 ? shellPath.slice(lastSlash + 1) : shellPath).toLowerCase();
  return base.endsWith('.exe') ? base.slice(0, -4) : base;
}

function shellExists(shellPath) {
  if (!shellPath) return false;
  try {
    const stat = fs.statSync(shellPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export function shellFlags(shellPath) {
  const name = normalizeBasename(shellPath);
  switch (name) {
    case 'zsh':
    case 'bash':
    case 'fish':
    case 'sh':
    case 'dash':
    case 'ash':
    case 'ksh':
      return [...POSIX_LOGIN_INTERACTIVE];
    case 'pwsh':
    case 'powershell':
      return [...PWSH_FLAGS];
    case 'cmd':
      return [...CMD_FLAGS];
    default:
      return process.platform === 'win32' ? [...CMD_FLAGS] : [...POSIX_LOGIN_INTERACTIVE];
  }
}

export function resolveShell(env = process.env, platform = process.platform) {
  const override = env.CLAUDEGUI_SHELL;
  if (override && shellExists(override)) {
    return { shell: override, args: shellFlags(override) };
  }

  if (platform === 'win32') {
    const comspec = env.COMSPEC;
    if (comspec && shellExists(comspec)) {
      return { shell: comspec, args: shellFlags(comspec) };
    }
    return { shell: 'cmd.exe', args: [] };
  }

  const candidates = [env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'];
  for (const candidate of candidates) {
    if (candidate && shellExists(candidate)) {
      return { shell: candidate, args: shellFlags(candidate) };
    }
  }
  return { shell: '/bin/sh', args: shellFlags('/bin/sh') };
}

const STRIPPED_ENV_KEYS = Object.freeze([
  'NODE_OPTIONS',
  'ELECTRON_RUN_AS_NODE',
  'NODE_DEBUG',
  'NODE_PRESERVE_SYMLINKS',
  '__NEXT_PRIVATE_ORIGIN',
  '__NEXT_PRIVATE_PREBUNDLED_REACT',
  'NEXT_TELEMETRY_DISABLED',
]);

function readAppVersion() {
  try {
    const pkgUrl = new URL('../../package.json', import.meta.url);
    const raw = fs.readFileSync(pkgUrl, 'utf-8');
    const pkg = JSON.parse(raw);
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

let cachedVersion = null;
function appVersion() {
  if (cachedVersion == null) cachedVersion = readAppVersion();
  return cachedVersion;
}

export function buildPtyEnv(shellPath, baseEnv = process.env, platform = process.platform) {
  const env = { ...baseEnv };

  for (const key of STRIPPED_ENV_KEYS) {
    delete env[key];
  }

  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.TERM_PROGRAM = 'ClaudeGUI';
  env.TERM_PROGRAM_VERSION = appVersion();

  if (platform !== 'win32') {
    if (!env.LANG && !env.LC_ALL) {
      env.LANG = 'en_US.UTF-8';
    }
    if (!env.HOME) {
      env.HOME = os.homedir();
    }
  }

  const extra = baseEnv.CLAUDEGUI_EXTRA_PATH;
  if (extra) {
    const sep = platform === 'win32' ? ';' : ':';
    env.PATH = `${extra}${sep}${env.PATH ?? ''}`;
  }

  // Hint for user shell rc files that can opt into ClaudeGUI-specific setup.
  env.CLAUDEGUI_PTY = '1';

  // The shell being launched (useful for debugging).
  if (shellPath) env.CLAUDEGUI_SHELL_PATH = shellPath;

  return env;
}
