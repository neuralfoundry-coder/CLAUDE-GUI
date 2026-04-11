import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/fs/errors';
import { discoverSessions } from '@/lib/claude/session-discovery';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sessions = await discoverSessions();
    return apiSuccess({ sessions });
  } catch (err) {
    return apiError(String(err), 5500, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string; cwd?: string };
    // A new session is created implicitly by the Agent SDK on next query.
    // We return a placeholder id so the client can track it.
    const id = `pending-${Date.now()}`;
    return apiSuccess({ sessionId: id, name: body.name, cwd: body.cwd });
  } catch {
    return apiError('Invalid JSON', 4400, 400);
  }
}
