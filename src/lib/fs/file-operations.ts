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

export async function deleteEntry(
  absolutePath: string,
  options: { recursive?: boolean } = {},
): Promise<void> {
  const { recursive = false } = options;
  const stat = await fs.lstat(absolutePath);
  if (stat.isDirectory()) {
    if (recursive) {
      await fs.rm(absolutePath, { recursive: true, force: false });
    } else {
      await fs.rmdir(absolutePath);
    }
  } else {
    await fs.unlink(absolutePath);
  }
}

async function uniqueDestination(destAbs: string): Promise<string> {
  try {
    await fs.lstat(destAbs);
  } catch {
    return destAbs;
  }
  const dir = path.dirname(destAbs);
  const base = path.basename(destAbs);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  for (let i = 1; i < 1000; i++) {
    const candidate = path.join(dir, `${stem} (${i})${ext}`);
    try {
      await fs.lstat(candidate);
    } catch {
      return candidate;
    }
  }
  const err = new Error('Could not find a unique destination filename') as Error & { code: string };
  err.code = 'EEXIST';
  throw err;
}

export async function copyEntry(
  srcAbs: string,
  destAbs: string,
): Promise<{ writtenPath: string }> {
  const srcStat = await fs.lstat(srcAbs);
  if (srcStat.isDirectory()) {
    // dest === src is allowed and means "duplicate in place" — uniqueDestination
    // will append a " (n)" suffix. Reject only when dest is strictly inside src.
    const srcWithSep = srcAbs.endsWith(path.sep) ? srcAbs : srcAbs + path.sep;
    if (destAbs !== srcAbs && destAbs.startsWith(srcWithSep)) {
      const err = new Error('Cannot copy a directory into itself') as Error & { code: string };
      err.code = 'EINVAL';
      throw err;
    }
  }
  const finalDest = await uniqueDestination(destAbs);
  await fs.mkdir(path.dirname(finalDest), { recursive: true });
  await fs.cp(srcAbs, finalDest, { recursive: true, force: false, errorOnExist: true });
  return { writtenPath: finalDest };
}

export async function makeDirectory(absolutePath: string, recursive: boolean): Promise<void> {
  await fs.mkdir(absolutePath, { recursive });
}

export async function renameEntry(oldAbs: string, newAbs: string): Promise<void> {
  await fs.mkdir(path.dirname(newAbs), { recursive: true });
  await fs.rename(oldAbs, newAbs);
}
