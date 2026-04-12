/**
 * Server configuration manager for remote access settings.
 * Reads/writes ~/.claudegui/server-config.json.
 *
 * This file is .mjs so it can be imported from both server.js (CJS via dynamic
 * import) and Next.js API routes (ESM/TS).
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

/** @returns {string} ~/.claudegui */
function configDir() {
  return join(homedir(), '.claudegui');
}

/** @returns {string} ~/.claudegui/server-config.json */
export function configPath() {
  return join(configDir(), 'server-config.json');
}

/**
 * @typedef {Object} ServerConfig
 * @property {boolean} remoteAccess
 * @property {string|null} remoteAccessToken
 * @property {string|null} [anthropicApiKey]
 */

/** @returns {ServerConfig} */
function defaults() {
  return { remoteAccess: false, remoteAccessToken: null, anthropicApiKey: null };
}

/**
 * Synchronously load config. Returns defaults when file is missing or invalid.
 * @returns {ServerConfig}
 */
export function loadServerConfigSync() {
  try {
    const raw = readFileSync(configPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      remoteAccess: typeof parsed.remoteAccess === 'boolean' ? parsed.remoteAccess : false,
      remoteAccessToken: typeof parsed.remoteAccessToken === 'string' ? parsed.remoteAccessToken : null,
      anthropicApiKey: typeof parsed.anthropicApiKey === 'string' && parsed.anthropicApiKey.length > 0 ? parsed.anthropicApiKey : null,
    };
  } catch {
    return defaults();
  }
}

/**
 * Atomically save config (write tmp → rename).
 * @param {ServerConfig} config
 */
export function saveServerConfig(config) {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });

  const target = configPath();
  const tmp = target + '.tmp.' + process.pid;
  writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  renameSync(tmp, target);
}

/**
 * Generate a new access token (UUID v4).
 * @returns {string}
 */
export function generateToken() {
  return randomUUID();
}
