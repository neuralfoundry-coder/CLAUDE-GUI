import { NextRequest } from 'next/server';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { apiError, apiSuccess } from '@/lib/fs/errors';

export const dynamic = 'force-dynamic';

async function listClaudeSessions() {
  const base = path.join(os.homedir(), '.claude', 'projects');
  try {
    const dirents = await fs.readdir(base, { withFileTypes: true });
    const sessions: Array<{ id: string; name: string; cwd: string }> = [];
    for (const d of dirents) {
      if (!d.isDirectory()) continue;
      sessions.push({ id: d.name, name: d.name, cwd: d.name.replace(/-/g, '/') });
    }
    return sessions;
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const sessions = await listClaudeSessions();
    return apiSuccess({ sessions });
  } catch (err) {
    return apiError(String(err), 5500, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string; cwd?: string };
    const id = `sess-${Date.now()}`;
    return apiSuccess({ sessionId: id, name: body.name, cwd: body.cwd });
  } catch {
    return apiError('Invalid JSON', 4400, 400);
  }
}
