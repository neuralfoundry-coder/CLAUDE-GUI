import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/fs/errors';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return apiSuccess({ id: params.id, messages: [] });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!params.id) return apiError('id required', 4400, 400);
  return apiSuccess({ deleted: params.id });
}
