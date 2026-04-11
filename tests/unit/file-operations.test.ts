import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  listDirectory,
  readTextFile,
  writeTextFile,
  deleteEntry,
  makeDirectory,
  renameEntry,
  statFile,
} from '@/lib/fs/file-operations';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'claudegui-ops-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('file operations', () => {
  it('lists a directory with sorted entries (dirs first)', async () => {
    await fs.mkdir(path.join(root, 'dir1'));
    await fs.writeFile(path.join(root, 'a.txt'), 'a');
    await fs.writeFile(path.join(root, 'b.txt'), 'bb');
    const entries = await listDirectory(root);
    expect(entries[0]!.name).toBe('dir1');
    expect(entries[0]!.type).toBe('directory');
    expect(entries[1]!.name).toBe('a.txt');
    expect(entries[2]!.size).toBe(2);
  });

  it('skips .env and .git entries', async () => {
    await fs.writeFile(path.join(root, '.env'), 'x');
    await fs.mkdir(path.join(root, '.git'));
    await fs.writeFile(path.join(root, 'regular.txt'), 'y');
    const entries = await listDirectory(root);
    expect(entries.map((e) => e.name)).toEqual(['regular.txt']);
  });

  it('reads and writes text files', async () => {
    const p = path.join(root, 'nested', 'file.txt');
    await writeTextFile(p, 'hello world');
    const { content, size } = await readTextFile(p);
    expect(content).toBe('hello world');
    expect(size).toBe(11);
  });

  it('deletes files and empty directories', async () => {
    const f = path.join(root, 'f.txt');
    await fs.writeFile(f, 'x');
    await deleteEntry(f);
    await expect(fs.stat(f)).rejects.toThrow();

    const d = path.join(root, 'emptydir');
    await fs.mkdir(d);
    await deleteEntry(d);
    await expect(fs.stat(d)).rejects.toThrow();
  });

  it('creates directories recursively', async () => {
    await makeDirectory(path.join(root, 'a', 'b', 'c'), true);
    const stat = await fs.stat(path.join(root, 'a', 'b', 'c'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('renames files', async () => {
    const old = path.join(root, 'old.txt');
    const next = path.join(root, 'new.txt');
    await fs.writeFile(old, 'x');
    await renameEntry(old, next);
    await expect(fs.stat(old)).rejects.toThrow();
    const stat = await fs.stat(next);
    expect(stat.isFile()).toBe(true);
  });

  it('stats a file', async () => {
    const f = path.join(root, 's.txt');
    await fs.writeFile(f, 'abc');
    const s = await statFile(f);
    expect(s.isFile).toBe(true);
    expect(s.size).toBe(3);
  });
});
