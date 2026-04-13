import { headers } from 'next/headers';
import { getActiveRoot } from '@/lib/project/project-context.mjs';
import { browserSessionRegistry } from '@/lib/project/browser-session-registry.mjs';
import { getGitStatus, isGitRepository } from '@/lib/fs/git-status';
import { apiSuccess, apiError } from '@/lib/fs/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let browserId: string | null = null;
    try {
      const hdrs = headers();
      browserId = hdrs.get('x-browser-id') || null;
    } catch {
      /* not in request context */
    }
    const root = browserId ? browserSessionRegistry.getRoot(browserId) : getActiveRoot();
    if (!root) {
      return apiSuccess({ branch: null, files: {}, isRepo: false });
    }
    const isRepo = await isGitRepository(root);
    if (!isRepo) {
      return apiSuccess({ branch: null, files: {}, isRepo: false });
    }
    const status = await getGitStatus(root);
    return apiSuccess({ ...status, isRepo: true });
  } catch (err) {
    return apiError((err as Error).message, 5500, 500);
  }
}
