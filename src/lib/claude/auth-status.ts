import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export type AuthSource = 'credentials-file' | 'env' | 'cli-oauth' | 'none';

export interface AuthStatus {
  authenticated: boolean;
  source: AuthSource;
  cliInstalled: boolean;
  lastChecked: string;
  email?: string;
  authMethod?: string;
  orgName?: string;
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

interface CliAuthResult {
  loggedIn: boolean;
  email?: string;
  authMethod?: string;
  orgName?: string;
}

async function checkCliAuthStatus(): Promise<CliAuthResult | null> {
  try {
    const { stdout } = await execAsync('claude auth status --json', { timeout: 2500 });
    const parsed = JSON.parse(stdout.trim());
    if (parsed && parsed.loggedIn === true) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function checkAuth(): Promise<AuthStatus> {
  const [credsOk, cliOk, cliAuth] = await Promise.all([
    hasCredentialsFile(),
    isCliInstalled(),
    checkCliAuthStatus(),
  ]);
  const envOk = hasEnvKey();

  if (cliAuth) {
    return {
      authenticated: true,
      source: 'cli-oauth',
      cliInstalled: cliOk,
      lastChecked: new Date().toISOString(),
      email: cliAuth.email,
      authMethod: cliAuth.authMethod,
      orgName: cliAuth.orgName,
    };
  }

  const source: AuthSource = credsOk ? 'credentials-file' : envOk ? 'env' : 'none';
  return {
    authenticated: credsOk || envOk,
    source,
    cliInstalled: cliOk,
    lastChecked: new Date().toISOString(),
  };
}
