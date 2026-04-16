import { NextRequest } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { apiError, apiSuccess } from '@/lib/fs/errors';
import { rateLimit, clientKey } from '@/lib/fs/rate-limit';
import { getActiveRoot } from '@/lib/project/project-context.mjs';
import { browserSessionRegistry } from '@/lib/project/browser-session-registry.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const execAsync = promisify(exec);

const MAX_RESULTS = 200;
const SEARCH_TIMEOUT_MS = 10_000;

interface SearchMatch {
  file: string;
  line: number;
  text: string;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(clientKey(req));
  if (!rl.ok) return apiError('Too many requests', 4429, 429);

  const query = req.nextUrl.searchParams.get('q');
  if (!query || query.trim().length === 0) {
    return apiError('Query parameter "q" is required', 4400, 400);
  }
  if (query.length > 500) {
    return apiError('Query too long', 4400, 400);
  }

  const glob = req.nextUrl.searchParams.get('glob') || '';
  const caseSensitive = req.nextUrl.searchParams.get('case') !== 'false';

  const browserId = req.headers.get('x-browser-id');
  const cwd = browserSessionRegistry.getRoot(browserId) ?? getActiveRoot();
  if (!cwd) {
    return apiError('No project is open', 4412, 412);
  }

  // Prefer ripgrep (rg), fall back to grep.
  const rgArgs = [
    '--no-heading',
    '--line-number',
    '--color=never',
    `--max-count=${MAX_RESULTS}`,
    '--max-filesize=1M',
    // Ignore common heavy directories
    '--glob=!node_modules',
    '--glob=!.git',
    '--glob=!.next',
    '--glob=!dist',
    '--glob=!build',
    '--glob=!coverage',
  ];
  if (!caseSensitive) rgArgs.push('--ignore-case');
  if (glob) rgArgs.push(`--glob=${glob}`);

  // Escape the query for shell safety by passing via env variable
  const escapedQuery = query.replace(/'/g, "'\\''");
  const cmd = `rg ${rgArgs.join(' ')} -- '${escapedQuery}' . 2>/dev/null || grep -rn ${!caseSensitive ? '-i' : ''} --include='${glob || '*'}' -- '${escapedQuery}' . 2>/dev/null || true`;

  try {
    const { stdout } = await execAsync(cmd, {
      cwd,
      timeout: SEARCH_TIMEOUT_MS,
      maxBuffer: 5 * 1024 * 1024,
    });

    const matches: SearchMatch[] = [];
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (matches.length >= MAX_RESULTS) break;
      if (!line) continue;
      // Format: ./file:line:text  or  file:line:text
      const m = line.match(/^\.?\/?(.+?):(\d+):(.*)$/);
      if (m) {
        matches.push({
          file: m[1]!,
          line: parseInt(m[2]!, 10),
          text: m[3]!.slice(0, 500),
        });
      }
    }

    return apiSuccess({ matches, total: matches.length, truncated: matches.length >= MAX_RESULTS });
  } catch {
    return apiError('Search failed or timed out', 5500, 500);
  }
}
