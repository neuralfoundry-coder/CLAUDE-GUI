import { NextRequest } from 'next/server';
import {
  getRecents,
  ProjectRootError,
} from '@/lib/project/project-context.mjs';
import { browserSessionRegistry } from '@/lib/project/browser-session-registry.mjs';
import { apiError, apiSuccess } from '@/lib/fs/errors';

export const dynamic = 'force-dynamic';

function extractBrowserId(req: NextRequest): string | null {
  return req.headers.get('x-browser-id') || null;
}

export async function GET(req: NextRequest) {
  const browserId = extractBrowserId(req);
  if (browserId) {
    browserSessionRegistry.ensureSession(browserId);
  }
  return apiSuccess({
    root: browserSessionRegistry.getRoot(browserId),
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
  const browserId = extractBrowserId(req);
  try {
    // setRoot updates the per-session root and notifies per-session listeners
    // (which the files-handler subscribes to for project-changed events).
    const abs = browserSessionRegistry.setRoot(browserId, path);
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
