import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getGitStatus, isGitRepository } from '@/lib/fs/git-status';

const execAsync = promisify(exec);

let tmpDir: string;
let skipGitTests = false;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claudegui-git-'));
  try {
    await execAsync('git --version');
    await execAsync('git init', { cwd: tmpDir });
    await execAsync('git config user.email "test@test.com"', { cwd: tmpDir });
    await execAsync('git config user.name "Test"', { cwd: tmpDir });
    await fs.writeFile(path.join(tmpDir, 'tracked.txt'), 'initial');
    await execAsync('git add .', { cwd: tmpDir });
    await execAsync('git commit -m "init"', { cwd: tmpDir });
  } catch {
    skipGitTests = true;
  }
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('git-status', () => {
  it('returns false for non-git directory', async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'claudegui-nogit-'));
    try {
      const isRepo = await isGitRepository(other);
      expect(isRepo).toBe(false);
    } finally {
      await fs.rm(other, { recursive: true, force: true });
    }
  });

  it('identifies git repository and parses status', async () => {
    if (skipGitTests) return;
    expect(await isGitRepository(tmpDir)).toBe(true);

    await fs.writeFile(path.join(tmpDir, 'tracked.txt'), 'modified');
    await fs.writeFile(path.join(tmpDir, 'new.txt'), 'untracked');

    const status = await getGitStatus(tmpDir);
    expect(status.files['tracked.txt']).toBe('modified');
    expect(status.files['new.txt']).toBe('untracked');
  });
});
