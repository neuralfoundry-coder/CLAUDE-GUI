import { NextRequest } from 'next/server';
import { resolveSafe } from '@/lib/fs/resolve-safe';
import { apiError, apiSuccess, handleApiError } from '@/lib/fs/errors';
import { readTextFile } from '@/lib/fs/file-operations';
import { rateLimit, clientKey } from '@/lib/fs/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const rl = rateLimit(clientKey(req));
  if (!rl.ok) return apiError('Too many requests', 4429, 429);

  const p = req.nextUrl.searchParams.get('path');
  if (!p) return apiError('path required', 4400, 400);
  try {
    const abs = await resolveSafe(p);
    const { content, size } = await readTextFile(abs);
    return apiSuccess({ content, encoding: 'utf-8', size });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'ETOOBIG') return apiError('File too large', 4413, 413);
    return handleApiError(err);
  }
}
