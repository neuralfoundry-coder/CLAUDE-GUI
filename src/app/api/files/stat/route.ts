import { NextRequest } from 'next/server';
import { resolveSafe } from '@/lib/fs/resolve-safe';
import { apiError, apiSuccess, handleApiError } from '@/lib/fs/errors';
import { statFile } from '@/lib/fs/file-operations';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get('path');
  if (!p) return apiError('path required', 4400, 400);
  try {
    const abs = await resolveSafe(p);
    const stat = await statFile(abs);
    return apiSuccess(stat);
  } catch (err) {
    return handleApiError(err);
  }
}
