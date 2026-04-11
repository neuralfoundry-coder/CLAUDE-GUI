import { getActiveRoot } from '@/lib/project/project-context.mjs';
import { getGitStatus, isGitRepository } from '@/lib/fs/git-status';
import { apiSuccess, apiError } from '@/lib/fs/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const root = getActiveRoot();
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
