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

export async function GET(req: NextRequest) {
  const rl = rateLimit(clientKey(req));
  if (!rl.ok) return apiError('Too many requests', 4429, 429);

  const filePath = req.nextUrl.searchParams.get('path');
  const staged = req.nextUrl.searchParams.get('staged') === 'true';

  const browserId = req.headers.get('x-browser-id');
  const cwd = browserSessionRegistry.getRoot(browserId) ?? getActiveRoot();
  if (!cwd) {
    return apiError('No project is open', 4412, 412);
  }

  const escaped = filePath ? filePath.replace(/'/g, "'\\''") : '';

  try {
    const args = staged ? '--cached' : '';
    const pathArg = filePath ? `-- '${escaped}'` : '';
    const diffCmd = `git diff ${args} ${pathArg}`;

    const [diffResult, originalResult] = await Promise.all([
      execAsync(diffCmd, { cwd, timeout: 10_000, maxBuffer: 5 * 1024 * 1024 }),
      filePath
        ? execAsync(`git show HEAD:'${escaped}' 2>/dev/null || true`, {
            cwd,
            timeout: 10_000,
            maxBuffer: 5 * 1024 * 1024,
          })
        : Promise.resolve({ stdout: '' }),
    ]);

    return apiSuccess({
      diff: diffResult.stdout,
      original: originalResult.stdout,
      path: filePath,
    });
  } catch {
    return apiError('Failed to get git diff', 5500, 500);
  }
}
