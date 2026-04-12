import { apiSuccess } from '@/lib/fs/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { getMcpServerStatus } = await import(
      /* webpackIgnore: true */ '../../../../server-handlers/claude-handler.mjs' as string
    );
    const statuses = await getMcpServerStatus();
    return apiSuccess({ statuses });
  } catch {
    // Handler not available or no active session — return empty
    return apiSuccess({ statuses: [] });
  }
}
