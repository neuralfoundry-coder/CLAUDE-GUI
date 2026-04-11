// Invoked by the embedded server on first boot inside a Tauri-packaged build.
// Ensures the Claude CLI is available in the app-local node prefix so the
// built-in web terminal can run `claude` without needing a global install.

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

function appDataRoot() {
  if (process.env.CLAUDEGUI_APP_DATA) return process.env.CLAUDEGUI_APP_DATA;
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'ClaudeGUI');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'ClaudeGUI');
  }
  return path.join(os.homedir(), '.local', 'share', 'ClaudeGUI');
}

export function claudePrefix() {
  return path.join(appDataRoot(), 'node-prefix');
}

export function claudeBinDir() {
  const prefix = claudePrefix();
  return process.platform === 'win32' ? prefix : path.join(prefix, 'bin');
}

export function claudeBinPath() {
  const dir = claudeBinDir();
  return path.join(dir, process.platform === 'win32' ? 'claude.cmd' : 'claude');
}

export function isClaudeInstalled() {
  return existsSync(claudeBinPath());
}

export async function ensureClaudeCli({ onLog } = {}) {
  if (isClaudeInstalled()) return { installed: true, skipped: true };
  const prefix = claudePrefix();
  const log = onLog ?? (() => undefined);
  log(`Installing Claude CLI into ${prefix}`);

  await new Promise((resolve, reject) => {
    const child = spawn(
      'npm',
      ['install', '-g', '@anthropic-ai/claude-code', '--prefix', prefix],
      { stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(undefined) : reject(new Error(`npm exit ${code}`))));
  });

  return { installed: isClaudeInstalled(), skipped: false };
}
