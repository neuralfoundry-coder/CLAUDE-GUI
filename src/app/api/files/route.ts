import { NextRequest } from 'next/server';
import { resolveSafe } from '@/lib/fs/resolve-safe';
import { apiError, apiSuccess, handleApiError } from '@/lib/fs/errors';
import { listDirectory, deleteEntry } from '@/lib/fs/file-operations';
import { rateLimit, clientKey } from '@/lib/fs/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const rl = rateLimit(clientKey(req));
  if (!rl.ok) return apiError('Too many requests', 4429, 429);

  const p = req.nextUrl.searchParams.get('path') ?? '';
  try {
    const abs = await resolveSafe(p);
    const entries = await listDirectory(abs);
    return apiSuccess({ path: p, entries });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(clientKey(req));
  if (!rl.ok) return apiError('Too many requests', 4429, 429);

  const p = req.nextUrl.searchParams.get('path');
  if (!p) return apiError('path required', 4400, 400);
  const recursiveParam = req.nextUrl.searchParams.get('recursive');
  const recursive = recursiveParam === '1' || recursiveParam === 'true';
  try {
    const abs = await resolveSafe(p);
    await deleteEntry(abs, { recursive });
    return apiSuccess({ deleted: p });
  } catch (err) {
    return handleApiError(err);
  }
}
