import { NextRequest } from 'next/server';
import { resolveSafe } from '@/lib/fs/resolve-safe';
import { apiError, apiSuccess, handleApiError } from '@/lib/fs/errors';
import { makeDirectory } from '@/lib/fs/file-operations';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { path?: string; recursive?: boolean };
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON', 4400, 400);
  }
  const { path: p, recursive = true } = body;
  if (!p) return apiError('path required', 4400, 400);
  try {
    const abs = await resolveSafe(p);
    await makeDirectory(abs, recursive);
    return apiSuccess({ created: p });
  } catch (err) {
    return handleApiError(err);
  }
}
