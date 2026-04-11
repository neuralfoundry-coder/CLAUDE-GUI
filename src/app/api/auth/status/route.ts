import { checkAuth } from '@/lib/claude/auth-status';
import { apiSuccess, apiError } from '@/lib/fs/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await checkAuth();
    return apiSuccess(status);
  } catch (err) {
    return apiError(String((err as Error)?.message ?? err), 5500, 500);
  }
}
