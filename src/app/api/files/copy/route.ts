import { NextRequest } from 'next/server';
import path from 'node:path';
import { resolveSafe, getProjectRoot } from '@/lib/fs/resolve-safe';
import { apiError, apiSuccess, handleApiError } from '@/lib/fs/errors';
import { copyEntry } from '@/lib/fs/file-operations';
import { rateLimit, clientKey } from '@/lib/fs/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req));
  if (!rl.ok) return apiError('Too many requests', 4429, 429);

  let body: { srcPath?: string; destPath?: string };
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON', 4400, 400);
  }
  const { srcPath, destPath } = body;
  if (!srcPath || !destPath) {
    return apiError('srcPath and destPath required', 4400, 400);
  }
  try {
    const srcAbs = await resolveSafe(srcPath);
    const destAbs = await resolveSafe(destPath);
    const { writtenPath } = await copyEntry(srcAbs, destAbs);
    const writtenRel = path.relative(getProjectRoot(), writtenPath);
    return apiSuccess({ srcPath, destPath, writtenPath: writtenRel });
  } catch (err) {
    return handleApiError(err);
  }
}
