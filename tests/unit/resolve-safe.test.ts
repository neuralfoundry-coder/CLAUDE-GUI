import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveSafe, SandboxError } from '@/lib/fs/resolve-safe';

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'claudegui-test-'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'hello.ts'), 'export {}');
  await fs.writeFile(path.join(root, '.env'), 'SECRET=1');
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('resolveSafe', () => {
  it('resolves a valid relative path', async () => {
    const abs = await resolveSafe('src/hello.ts', root);
    expect(abs).toBe(path.join(root, 'src', 'hello.ts'));
  });

  it('returns root for empty path', async () => {
    const abs = await resolveSafe('', root);
    expect(abs).toBe(path.resolve(root));
  });

  it('rejects path traversal with ..', async () => {
    await expect(resolveSafe('../etc/passwd', root)).rejects.toBeInstanceOf(SandboxError);
  });

  it('rejects absolute paths outside root', async () => {
    await expect(resolveSafe('/etc/passwd', root)).rejects.toBeInstanceOf(SandboxError);
  });

  it('rejects .env access', async () => {
    await expect(resolveSafe('.env', root)).rejects.toBeInstanceOf(SandboxError);
  });

  it('rejects .git access', async () => {
    await expect(resolveSafe('.git/config', root)).rejects.toBeInstanceOf(SandboxError);
  });

  it('rejects nested .env access', async () => {
    await expect(resolveSafe('src/../.env', root)).rejects.toBeInstanceOf(SandboxError);
  });

  it('rejects symlink escape', async () => {
    const linkPath = path.join(root, 'escape');
    try {
      await fs.symlink('/tmp', linkPath);
      await expect(resolveSafe('escape', root)).rejects.toBeInstanceOf(SandboxError);
    } finally {
      await fs.unlink(linkPath).catch(() => undefined);
    }
  });

  it('allows paths within root that do not exist yet', async () => {
    const abs = await resolveSafe('src/new-file.ts', root);
    expect(abs).toBe(path.join(root, 'src', 'new-file.ts'));
  });
});
