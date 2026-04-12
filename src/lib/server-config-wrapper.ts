/**
 * Server config manager for Next.js API routes (TypeScript).
 * Reads/writes ~/.claudegui/server-config.json.
 * Pure TypeScript — no .mjs dependency.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export interface ServerConfig {
  remoteAccess: boolean;
  remoteAccessToken: string | null;
}

function configDir(): string {
  return join(homedir(), '.claudegui');
}

function configPath(): string {
  return join(configDir(), 'server-config.json');
}

function defaults(): ServerConfig {
  return { remoteAccess: false, remoteAccessToken: null };
}

export async function loadServerConfig(): Promise<ServerConfig> {
  try {
    const raw = readFileSync(configPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      remoteAccess: typeof parsed.remoteAccess === 'boolean' ? parsed.remoteAccess : false,
      remoteAccessToken: typeof parsed.remoteAccessToken === 'string' ? parsed.remoteAccessToken : null,
    };
  } catch {
    return defaults();
  }
}

export async function saveServerConfig(config: ServerConfig): Promise<void> {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });

  const target = configPath();
  const tmp = target + '.tmp.' + process.pid;
  writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  renameSync(tmp, target);
}

export async function generateToken(): Promise<string> {
  return randomUUID();
}
