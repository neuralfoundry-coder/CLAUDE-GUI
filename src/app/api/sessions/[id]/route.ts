import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/fs/errors';
import { getSession, deleteSession, getSessionHistory } from '@/lib/claude/session-discovery';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(params.id);
  if (!session) return apiError('Session not found', 4404, 404);
  const history = await getSessionHistory(params.id);
  return apiSuccess({ ...session, history });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!params.id) return apiError('id required', 4400, 400);
  const ok = await deleteSession(params.id);
  if (!ok) return apiError('Session not found', 4404, 404);
  return apiSuccess({ deleted: params.id });
}
