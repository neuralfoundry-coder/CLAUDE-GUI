import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { apiSuccess, apiError } from '@/lib/fs/errors';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await execAsync('claude logout', { timeout: 5000 });
    return apiSuccess({ loggedOut: true });
  } catch (err) {
    return apiError(
      String((err as Error)?.message ?? 'Logout failed'),
      5500,
      500,
    );
  }
}
