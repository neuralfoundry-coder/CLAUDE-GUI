import { NextRequest } from 'next/server';
import { loadServerConfig, saveServerConfig } from '@/lib/server-config-wrapper';
import { apiSuccess, apiError } from '@/lib/fs/errors';

export const dynamic = 'force-dynamic';

function isLocalhost(req: NextRequest): boolean {
  const host = req.headers.get('host') || '';
  return host.startsWith('127.0.0.1') || host.startsWith('localhost') || host.startsWith('[::1]');
}

export async function POST(req: NextRequest) {
  if (!isLocalhost(req)) {
    return apiError('Forbidden', 4403, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON', 4400, 400);
  }

  const apiKey = typeof (body as Record<string, unknown>).apiKey === 'string'
    ? ((body as Record<string, unknown>).apiKey as string).trim()
    : '';

  if (!apiKey) {
    return apiError('API key is required', 4400, 400);
  }

  const config = await loadServerConfig();
  config.anthropicApiKey = apiKey;
  await saveServerConfig(config);

  // Inject into current process so hasEnvKey() picks it up immediately
  process.env.ANTHROPIC_API_KEY = apiKey;

  return apiSuccess({ saved: true });
}

export async function DELETE(req: NextRequest) {
  if (!isLocalhost(req)) {
    return apiError('Forbidden', 4403, 403);
  }

  const config = await loadServerConfig();
  config.anthropicApiKey = null;
  await saveServerConfig(config);

  delete process.env.ANTHROPIC_API_KEY;

  return apiSuccess({ removed: true });
}
