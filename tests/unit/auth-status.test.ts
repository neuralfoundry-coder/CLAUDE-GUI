import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { checkAuth } from '@/lib/claude/auth-status';

let tmpHome: string;
let originalHome: string | undefined;
let originalKey: string | undefined;
let originalToken: string | undefined;
let originalPath: string | undefined;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'claudegui-auth-'));
  await fs.mkdir(path.join(tmpHome, '.claude'), { recursive: true });
  originalHome = process.env.HOME;
  originalKey = process.env.ANTHROPIC_API_KEY;
  originalToken = process.env.ANTHROPIC_AUTH_TOKEN;
  originalPath = process.env.PATH;
  process.env.HOME = tmpHome;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.PATH = '/nonexistent-claudegui-test-path';
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
  if (originalToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
  else process.env.ANTHROPIC_AUTH_TOKEN = originalToken;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe('checkAuth', () => {
  it('returns none when no credentials and no env var', async () => {
    const status = await checkAuth();
    expect(status.authenticated).toBe(false);
    expect(status.source).toBe('none');
  });

  it('detects credentials file', async () => {
    await fs.writeFile(
      path.join(tmpHome, '.claude', '.credentials.json'),
      JSON.stringify({ access_token: 'abc', expires_at: Date.now() + 3600_000 }),
    );
    const status = await checkAuth();
    expect(status.authenticated).toBe(true);
    expect(status.source).toBe('credentials-file');
  });

  it('detects ANTHROPIC_API_KEY env var', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const status = await checkAuth();
    expect(status.authenticated).toBe(true);
    expect(status.source).toBe('env');
  });

  it('prefers credentials file over env var', async () => {
    await fs.writeFile(
      path.join(tmpHome, '.claude', '.credentials.json'),
      JSON.stringify({ access_token: 'abc' }),
    );
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const status = await checkAuth();
    expect(status.source).toBe('credentials-file');
  });

  it('ignores corrupt credentials file', async () => {
    await fs.writeFile(path.join(tmpHome, '.claude', '.credentials.json'), 'not json{');
    const status = await checkAuth();
    expect(status.authenticated).toBe(false);
    expect(status.source).toBe('none');
  });

  it('reports cliInstalled false when claude not on PATH', async () => {
    const status = await checkAuth();
    expect(status.cliInstalled).toBe(false);
  });

  it('reports cliInstalled true when claude binary exists on PATH', async () => {
    const binDir = path.join(tmpHome, 'bin');
    await fs.mkdir(binDir, { recursive: true });
    const claudePath = path.join(binDir, 'claude');
    await fs.writeFile(claudePath, '#!/bin/sh\necho test');
    await fs.chmod(claudePath, 0o755);
    process.env.PATH = binDir;
    const status = await checkAuth();
    expect(status.cliInstalled).toBe(true);
  });
});
