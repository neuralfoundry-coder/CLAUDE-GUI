import { NextRequest } from 'next/server';
import { apiError, apiSuccess, handleApiError } from '@/lib/fs/errors';
import { getProjectRoot } from '@/lib/fs/resolve-safe';
import { loadSettings, saveSettings, type McpServerEntry } from '@/lib/claude/settings-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const root = getProjectRoot();
    const settings = await loadSettings(root);
    const servers: Record<string, McpServerEntry> = settings.mcpServers ?? {};
    return apiSuccess({ mcpServers: servers });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const mcpServers = body?.mcpServers;
    if (!mcpServers || typeof mcpServers !== 'object') {
      return apiError('Invalid mcpServers body', 4400, 400);
    }
    const root = getProjectRoot();
    const settings = await loadSettings(root);
    settings.mcpServers = mcpServers as Record<string, McpServerEntry>;
    await saveSettings(settings, root);
    return apiSuccess({ saved: true, mcpServers: settings.mcpServers });
  } catch (err) {
    return handleApiError(err);
  }
}
