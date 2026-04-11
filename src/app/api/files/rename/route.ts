import { NextRequest } from 'next/server';
import { resolveSafe } from '@/lib/fs/resolve-safe';
import { apiError, apiSuccess, handleApiError } from '@/lib/fs/errors';
import { renameEntry } from '@/lib/fs/file-operations';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { oldPath?: string; newPath?: string };
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON', 4400, 400);
  }
  const { oldPath, newPath } = body;
  if (!oldPath || !newPath) return apiError('oldPath and newPath required', 4400, 400);
  try {
    const oldAbs = await resolveSafe(oldPath);
    const newAbs = await resolveSafe(newPath);
    await renameEntry(oldAbs, newAbs);
    return apiSuccess({ oldPath, newPath });
  } catch (err) {
    return handleApiError(err);
  }
}
