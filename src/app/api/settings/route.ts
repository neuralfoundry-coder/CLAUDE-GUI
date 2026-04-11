import { NextRequest } from 'next/server';
import { apiError, apiSuccess, handleApiError } from '@/lib/fs/errors';
import { loadSettings, saveSettings, normalizeRules, type ClaudeSettings } from '@/lib/claude/settings-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await loadSettings();
    const normalized = normalizeRules(settings);
    return apiSuccess({ settings, normalized });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as ClaudeSettings;
    if (!body || typeof body !== 'object') {
      return apiError('Invalid settings body', 4400, 400);
    }
    await saveSettings(body);
    return apiSuccess({ saved: true });
  } catch (err) {
    return handleApiError(err);
  }
}
