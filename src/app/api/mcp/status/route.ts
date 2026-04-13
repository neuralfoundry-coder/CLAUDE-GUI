import { type NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/fs/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const browserId = req.headers.get('x-browser-id') || null;
    const { getMcpServerStatus } = await import(
      /* webpackIgnore: true */ '../../../../server-handlers/claude-handler.mjs' as string
    );
    const statuses = await getMcpServerStatus(browserId);
    return apiSuccess({ statuses });
  } catch {
    // Handler not available or no active session — return empty
    return apiSuccess({ statuses: [] });
  }
}
