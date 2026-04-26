import { NextRequest } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { apiError, apiSuccess } from '@/lib/fs/errors';
import { rateLimit, clientKey } from '@/lib/fs/rate-limit';
import { getActiveRoot } from '@/lib/project/project-context.mjs';
import { browserSessionRegistry } from '@/lib/project/browser-session-registry.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

const CLI_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

// A slash command line (FR-516): starts with `/`, followed by command name
// (letters/digits/hyphen/underscore), optional whitespace + args. We only
// validate the *command-name* token; arg text is forwarded as-is to `claude`
// via execFile (no shell), so user input cannot inject extra processes.
const COMMAND_LINE_RE = /^\/[a-zA-Z][a-zA-Z0-9_-]{0,63}(\s.*)?$/s;

function resolveClaudeBinary(): string | null {
  // 1. App-local install (Tauri-packaged builds put the CLI here).
  const appDataRoot =
    process.env.CLAUDEGUI_APP_DATA ??
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'ClaudeGUI')
      : process.platform === 'win32'
        ? path.join(process.env.APPDATA ?? os.homedir(), 'ClaudeGUI')
        : path.join(os.homedir(), '.local', 'share', 'ClaudeGUI'));
  const localBin = path.join(
    appDataRoot,
    'node-prefix',
    process.platform === 'win32' ? '' : 'bin',
    process.platform === 'win32' ? 'claude.cmd' : 'claude',
  );
  if (existsSync(localBin)) return localBin;

  // 2. Common user install paths.
  const candidates =
    process.platform === 'win32'
      ? [path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'claude.cmd')]
      : [
          path.join(os.homedir(), '.local', 'bin', 'claude'),
          '/usr/local/bin/claude',
          '/opt/homebrew/bin/claude',
        ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  // 3. Defer to PATH lookup at exec time.
  return process.platform === 'win32' ? 'claude.cmd' : 'claude';
}

function clipOutput(s: string): string {
  if (s.length <= MAX_OUTPUT_BYTES) return s;
  return s.slice(0, MAX_OUTPUT_BYTES) + `\n\n_…output truncated at ${MAX_OUTPUT_BYTES} bytes._`;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req));
  if (!rl.ok) return apiError('Too many requests', 4429, 429);

  let body: { command?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON body', 4400, 400);
  }

  const command = typeof body.command === 'string' ? body.command.trim() : '';
  if (!command) return apiError('command is required', 4400, 400);
  if (!COMMAND_LINE_RE.test(command)) {
    return apiError('command must start with `/<name>` (letters/digits/-/_)', 4400, 400);
  }
  if (command.length > 4096) return apiError('command too long', 4400, 400);

  const browserId = req.headers.get('x-browser-id');
  const cwd = browserSessionRegistry.getRoot(browserId) ?? getActiveRoot();
  if (!cwd) return apiError('No project is open', 4412, 412);

  const bin = resolveClaudeBinary();
  if (!bin) return apiError('Claude CLI not found', 5404, 500);

  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(bin, ['--print', command], {
      cwd,
      timeout: CLI_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES * 4,
      env: { ...process.env, CLAUDE_CODE_NONINTERACTIVE: '1' },
    });
    return apiSuccess({
      output: clipOutput(stdout || stderr || '_(no output)_'),
      exitCode: 0,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
    };
    if (e.killed) {
      return apiError(`CLI timed out after ${CLI_TIMEOUT_MS / 1000}s`, 5408, 504);
    }
    if (e.code === 'ENOENT') {
      return apiError(`Claude CLI not found at ${bin}`, 5404, 500);
    }
    const combined = clipOutput([e.stdout, e.stderr].filter(Boolean).join('\n').trim());
    return apiSuccess({
      output: combined || `_CLI exited with code ${e.code}._`,
      exitCode: typeof e.code === 'number' ? e.code : 1,
      durationMs: Date.now() - startedAt,
    });
  }
}
