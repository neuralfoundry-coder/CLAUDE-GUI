import { NextRequest } from 'next/server';
import {
  getActiveRoot,
  getRecents,
  setActiveRoot,
  ProjectRootError,
} from '@/lib/project/project-context.mjs';
import { apiError, apiSuccess } from '@/lib/fs/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  return apiSuccess({
    root: getActiveRoot(),
    recents: getRecents(),
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON body', 4400, 400);
  }
  const path = (body as { path?: unknown })?.path;
  if (typeof path !== 'string' || path.trim() === '') {
    return apiError('path (string) required', 4400, 400);
  }
  try {
    const abs = setActiveRoot(path);
    return apiSuccess({
      root: abs,
      recents: getRecents(),
    });
  } catch (err) {
    if (err instanceof ProjectRootError) {
      const httpStatus = err.code === 4404 ? 404 : err.code === 4403 ? 403 : 400;
      return apiError(err.message, err.code, httpStatus);
    }
    return apiError(String((err as Error)?.message ?? err), 5500, 500);
  }
}
