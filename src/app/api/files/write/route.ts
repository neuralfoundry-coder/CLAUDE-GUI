import { NextRequest } from 'next/server';
import { resolveSafe } from '@/lib/fs/resolve-safe';
import { apiError, apiSuccess, handleApiError } from '@/lib/fs/errors';
import { writeTextFile } from '@/lib/fs/file-operations';
import { rateLimit, clientKey } from '@/lib/fs/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req));
  if (!rl.ok) return apiError('Too many requests', 4429, 429);

  let body: { path?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON', 4400, 400);
  }
  const { path: p, content } = body;
  if (!p) return apiError('path required', 4400, 400);
  if (typeof content !== 'string') return apiError('content required', 4400, 400);

  try {
    const abs = await resolveSafe(p);
    const size = await writeTextFile(abs, content);
    return apiSuccess({ size });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'ETOOBIG') return apiError('Content too large', 4413, 413);
    return handleApiError(err);
  }
}
