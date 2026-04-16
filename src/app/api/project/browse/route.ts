import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { apiError, apiSuccess } from '@/lib/fs/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/project/browse?path=/some/dir
 *
 * Returns subdirectories of the given path (or the user's home directory if
 * omitted). Used by the project picker to let users navigate the filesystem
 * without typing absolute paths manually.
 */
export async function GET(req: NextRequest) {
  const rawPath = req.nextUrl.searchParams.get('path') || os.homedir();
  const absPath = path.resolve(rawPath);

  // Block filesystem root to avoid showing system directories
  if (absPath === path.parse(absPath).root) {
    return apiError('Cannot browse filesystem root', 4403, 403);
  }

  try {
    fs.accessSync(absPath, fs.constants.R_OK);
  } catch {
    return apiError('Directory is not readable', 4403, 403);
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absPath, { withFileTypes: true });
  } catch {
    return apiError('Failed to read directory', 4404, 404);
  }

  const dirs = entries
    .filter((e) => {
      if (!e.isDirectory()) return false;
      // Skip hidden directories and common non-project dirs
      if (e.name.startsWith('.')) return false;
      if (e.name === 'node_modules' || e.name === '__pycache__') return false;
      return true;
    })
    .map((e) => path.join(absPath, e.name))
    .sort((a, b) => a.localeCompare(b));

  return apiSuccess({
    parent: path.dirname(absPath) !== absPath ? path.dirname(absPath) : null,
    current: absPath,
    dirs,
  });
}
