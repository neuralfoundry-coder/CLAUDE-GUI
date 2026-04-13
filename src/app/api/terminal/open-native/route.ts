import { NextRequest } from 'next/server';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSafe, getProjectRoot } from '@/lib/fs/resolve-safe';
import { apiError, apiSuccess, handleApiError } from '@/lib/fs/errors';
import { resolveLauncher, NoLauncherError } from './launchers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/terminal/open-native
 * Body: { cwd?: string }
 *
 * Opens the user's native terminal emulator (Terminal.app / iTerm / Windows
 * Terminal / gnome-terminal / …) with the given working directory. If `cwd`
 * is omitted, the active project root is used.
 *
 * The path is resolved against the active project root via `resolveSafe`
 * so path traversal is blocked. If `cwd` points at a file, the parent
 * directory is used.
 *
 * `CLAUDEGUI_EXTERNAL_TERMINAL` forces a specific terminal app (macOS
 * `open -a <name>`, Linux binary name). See `launchers.ts`.
 */
export async function POST(req: NextRequest) {
  let body: { cwd?: string } = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return apiError('Invalid JSON', 4400, 400);
  }

  try {
    let targetDir: string;
    if (body.cwd && body.cwd.trim()) {
      const abs = await resolveSafe(body.cwd.trim());
      let stat: import('node:fs').Stats;
      try {
        stat = await fs.stat(abs);
      } catch {
        return apiError(`Path not found: ${body.cwd}`, 4404, 404);
      }
      targetDir = stat.isDirectory() ? abs : path.dirname(abs);
    } else {
      targetDir = getProjectRoot();
    }

    let launcher;
    try {
      launcher = resolveLauncher({
        platform: process.platform,
        cwd: targetDir,
        env: process.env,
        exists: (p) => {
          // Absolute path → stat check. Bare name → PATH lookup.
          if (path.isAbsolute(p)) return existsSync(p);
          return isOnPath(p);
        },
      });
    } catch (err) {
      if (err instanceof NoLauncherError) {
        return apiError(err.message, 4501, 501);
      }
      throw err;
    }

    // Race a synchronous spawn against its async `error` event for a short
    // window so we can surface ENOENT as a clean 500 rather than letting it
    // escape to the unhandled-rejection log.
    const spawnError = await new Promise<Error | null>((resolve) => {
      let settled = false;
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(launcher.cmd, launcher.args, {
          detached: true,
          stdio: 'ignore',
          cwd: targetDir,
        });
      } catch (err) {
        resolve(err as Error);
        return;
      }
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.unref();
        resolve(null);
      }, 100);
      child.once('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(err);
      });
    });

    if (spawnError) {
      return apiError(
        `Failed to launch ${launcher.label}: ${spawnError.message}`,
        5500,
        500,
      );
    }

    return apiSuccess({
      launcher: launcher.label,
      cwd: targetDir,
      platform: process.platform,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

function isOnPath(bin: string): boolean {
  const pathEnv = process.env.PATH;
  if (!pathEnv) return false;
  const sep = process.platform === 'win32' ? ';' : ':';
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT?.split(';') ?? ['.EXE', '.CMD', '.BAT'])
    : [''];
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue;
    for (const ext of exts) {
      try {
        if (existsSync(path.join(dir, bin + ext))) return true;
      } catch {
        /* ignore */
      }
    }
  }
  return false;
}
