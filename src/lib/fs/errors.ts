import { NextResponse } from 'next/server';
import { SandboxError } from './resolve-safe';

export function apiError(message: string, code: number, httpStatus: number, details?: unknown) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      code,
      ...(details ? { details } : {}),
    },
    { status: httpStatus },
  );
}

export function apiSuccess<T>(data: T) {
  return NextResponse.json({ success: true, data });
}

export function handleApiError(err: unknown) {
  if (err instanceof SandboxError) {
    const http = err.code === 4412 ? 412 : 403;
    return apiError(err.message, err.code, http);
  }
  const e = err as NodeJS.ErrnoException;
  if (e.code === 'ENOENT') return apiError('File not found', 4404, 404);
  if (e.code === 'EACCES') return apiError('Permission denied', 4403, 403);
  if (e.code === 'EEXIST') return apiError('Already exists', 4409, 409);
  if (e.code === 'EISDIR') return apiError('Is a directory', 4400, 400);
  if (e.code === 'ENOTDIR') return apiError('Not a directory', 4400, 400);
  console.error('[api] unexpected error', err);
  return apiError('Internal server error', 5500, 500);
}
