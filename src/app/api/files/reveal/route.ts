import { NextRequest } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { resolveSafe } from '@/lib/fs/resolve-safe';
import { apiError, apiSuccess, handleApiError } from '@/lib/fs/errors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/files/reveal
 * Body: { path: string }
 *
 * Reveals the given path in the native OS file manager:
 * - macOS: `open -R <path>` — opens Finder with the file selected
 * - Windows: `explorer /select,<path>` — opens Explorer with the file selected
 * - Linux: `xdg-open <dirname>` — best effort, opens the containing folder
 *
 * The path is resolved against the current project root via `resolveSafe`
 * so path traversal is blocked. The file (or directory) must exist.
 */
export async function POST(req: NextRequest) {
  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON', 4400, 400);
  }

  const target = body.path;
  if (!target) return apiError('path required', 4400, 400);

  try {
    const abs = await resolveSafe(target);
    // Ensure the path exists (symlinks allowed; reveal-dir for non-existent
    // paths falls back to the parent directory).
    let stat: import('node:fs').Stats;
    try {
      stat = await fs.stat(abs);
    } catch {
      return apiError(`Path not found: ${target}`, 4404, 404);
    }

    const platform = process.platform;
    let cmd: string;
    let args: string[];

    if (platform === 'darwin') {
      cmd = 'open';
      args = ['-R', abs];
    } else if (platform === 'win32') {
      cmd = 'explorer';
      // explorer /select,<path> expects a file path; for directories, open the dir itself.
      args = stat.isDirectory() ? [abs] : [`/select,${abs}`];
    } else {
      // Linux and others — xdg-open the containing directory.
      cmd = 'xdg-open';
      args = [stat.isDirectory() ? abs : path.dirname(abs)];
    }

    const child = spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    // Spawn errors fire asynchronously; if spawn itself throws (e.g. ENOENT
    // for the binary), node emits an `error` event. We surface a generic
    // success since the OS may take a moment to bring the window up.
    return apiSuccess({ revealed: target, platform });
  } catch (err) {
    return handleApiError(err);
  }
}
