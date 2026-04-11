import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  listDirectory,
  readTextFile,
  writeTextFile,
  deleteEntry,
  copyEntry,
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

  it('refuses to delete a non-empty directory without recursive', async () => {
    const d = path.join(root, 'full');
    await fs.mkdir(d);
    await fs.writeFile(path.join(d, 'inside.txt'), 'x');
    await expect(deleteEntry(d)).rejects.toThrow();
    expect((await fs.stat(d)).isDirectory()).toBe(true);
  });

  it('recursively deletes a non-empty directory when opted in', async () => {
    const d = path.join(root, 'tree');
    await fs.mkdir(path.join(d, 'sub'), { recursive: true });
    await fs.writeFile(path.join(d, 'a.txt'), 'a');
    await fs.writeFile(path.join(d, 'sub', 'b.txt'), 'b');
    await deleteEntry(d, { recursive: true });
    await expect(fs.stat(d)).rejects.toThrow();
  });

  describe('copyEntry', () => {
    it('copies a single file to a new path', async () => {
      const src = path.join(root, 'a.txt');
      const dest = path.join(root, 'b.txt');
      await fs.writeFile(src, 'hello');
      const { writtenPath } = await copyEntry(src, dest);
      expect(writtenPath).toBe(dest);
      expect(await fs.readFile(dest, 'utf-8')).toBe('hello');
      expect(await fs.readFile(src, 'utf-8')).toBe('hello');
    });

    it('recursively copies a directory tree', async () => {
      const src = path.join(root, 'src');
      await fs.mkdir(path.join(src, 'sub'), { recursive: true });
      await fs.writeFile(path.join(src, 'a.txt'), 'a');
      await fs.writeFile(path.join(src, 'sub', 'b.txt'), 'b');
      const dest = path.join(root, 'dest');
      await copyEntry(src, dest);
      expect(await fs.readFile(path.join(dest, 'a.txt'), 'utf-8')).toBe('a');
      expect(await fs.readFile(path.join(dest, 'sub', 'b.txt'), 'utf-8')).toBe('b');
    });

    it('disambiguates with " (n)" suffix when destination already exists', async () => {
      const src = path.join(root, 'doc.txt');
      await fs.writeFile(src, 'one');
      const { writtenPath: first } = await copyEntry(src, src);
      expect(first).toBe(path.join(root, 'doc (1).txt'));
      const { writtenPath: second } = await copyEntry(src, src);
      expect(second).toBe(path.join(root, 'doc (2).txt'));
    });

    it('preserves directory base names without an extension when disambiguating', async () => {
      const src = path.join(root, 'folder');
      await fs.mkdir(src);
      await fs.writeFile(path.join(src, 'inside.txt'), 'x');
      const { writtenPath } = await copyEntry(src, src);
      expect(writtenPath).toBe(path.join(root, 'folder (1)'));
      expect(
        await fs.readFile(path.join(root, 'folder (1)', 'inside.txt'), 'utf-8'),
      ).toBe('x');
    });

    it('rejects copying a directory into itself or a descendant', async () => {
      const src = path.join(root, 'tree');
      await fs.mkdir(path.join(src, 'inner'), { recursive: true });
      await expect(copyEntry(src, src)).resolves.toBeDefined(); // suffix-disambiguated, not rejected
      await expect(copyEntry(src, path.join(src, 'inner', 'tree'))).rejects.toThrow(
        /Cannot copy a directory into itself/,
      );
    });
  });
});
