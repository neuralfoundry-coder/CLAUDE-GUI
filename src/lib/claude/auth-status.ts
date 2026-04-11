import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export type AuthSource = 'credentials-file' | 'env' | 'none';

export interface AuthStatus {
  authenticated: boolean;
  source: AuthSource;
  cliInstalled: boolean;
  lastChecked: string;
}

function credentialsPath(): string {
  return path.join(os.homedir(), '.claude', '.credentials.json');
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function hasCredentialsFile(): Promise<boolean> {
  const p = credentialsPath();
  if (!(await fileExists(p))) return false;
  try {
    const raw = await fs.readFile(p, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object';
  } catch {
    return false;
  }
}

function hasEnvKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

async function isCliInstalled(): Promise<boolean> {
  const pathEnv = process.env.PATH || '';
  const sep = process.platform === 'win32' ? ';' : ':';
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, `claude${ext}`);
      if (await fileExists(candidate)) return true;
    }
  }
  return false;
}

export async function checkAuth(): Promise<AuthStatus> {
  const [credsOk, cliOk] = await Promise.all([hasCredentialsFile(), isCliInstalled()]);
  const envOk = hasEnvKey();
  const source: AuthSource = credsOk ? 'credentials-file' : envOk ? 'env' : 'none';
  return {
    authenticated: credsOk || envOk,
    source,
    cliInstalled: cliOk,
    lastChecked: new Date().toISOString(),
  };
}
