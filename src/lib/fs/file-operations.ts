import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileEntry, FileStat, EntryType } from '@/types/files';

export const MAX_TEXT_SIZE = 10 * 1024 * 1024;
export const MAX_BINARY_SIZE = 50 * 1024 * 1024;

function toEntryType(dirent: { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }): EntryType {
  if (dirent.isDirectory()) return 'directory';
  if (dirent.isFile()) return 'file';
  if (dirent.isSymbolicLink()) return 'symlink';
  return 'other';
}

export async function listDirectory(absolutePath: string): Promise<FileEntry[]> {
  const dirents = await fs.readdir(absolutePath, { withFileTypes: true });
  const entries: FileEntry[] = [];
  for (const dirent of dirents) {
    if (dirent.name.startsWith('.')) {
      if (
        dirent.name === '.env' ||
        dirent.name.startsWith('.env.') ||
        dirent.name === '.git' ||
        dirent.name === '.ssh' ||
        dirent.name === '.claude'
      ) {
        continue;
      }
    }
    try {
      const stat = await fs.lstat(path.join(absolutePath, dirent.name));
      entries.push({
        name: dirent.name,
        type: toEntryType(dirent),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      });
    } catch {
      continue;
    }
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) {
      if (a.type === 'directory') return -1;
      if (b.type === 'directory') return 1;
    }
    return a.name.localeCompare(b.name);
  });
  return entries;
}

export async function statFile(absolutePath: string): Promise<FileStat> {
  const stat = await fs.lstat(absolutePath);
  return {
    size: stat.size,
    mtime: stat.mtime.toISOString(),
    ctime: stat.ctime.toISOString(),
    isDirectory: stat.isDirectory(),
    isFile: stat.isFile(),
    isSymbolicLink: stat.isSymbolicLink(),
  };
}

export async function readTextFile(absolutePath: string): Promise<{ content: string; size: number }> {
  const stat = await fs.stat(absolutePath);
  if (stat.size > MAX_TEXT_SIZE) {
    const err = new Error('Text file too large') as Error & { code: string };
    err.code = 'ETOOBIG';
    throw err;
  }
  const content = await fs.readFile(absolutePath, 'utf-8');
  return { content, size: stat.size };
}

export async function writeTextFile(absolutePath: string, content: string): Promise<number> {
  if (Buffer.byteLength(content, 'utf-8') > MAX_TEXT_SIZE) {
    const err = new Error('Content exceeds max size') as Error & { code: string };
    err.code = 'ETOOBIG';
    throw err;
  }
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf-8');
  return Buffer.byteLength(content, 'utf-8');
}

export async function deleteEntry(absolutePath: string): Promise<void> {
  const stat = await fs.lstat(absolutePath);
  if (stat.isDirectory()) {
    await fs.rmdir(absolutePath);
  } else {
    await fs.unlink(absolutePath);
  }
}

export async function makeDirectory(absolutePath: string, recursive: boolean): Promise<void> {
  await fs.mkdir(absolutePath, { recursive });
}

export async function renameEntry(oldAbs: string, newAbs: string): Promise<void> {
  await fs.mkdir(path.dirname(newAbs), { recursive: true });
  await fs.rename(oldAbs, newAbs);
}
