import { NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import { apiError, handleApiError } from '@/lib/fs/errors';
import { MAX_BINARY_SIZE } from '@/lib/fs/file-operations';
import { rateLimit, clientKey } from '@/lib/fs/rate-limit';
import { registerArtifactPath } from '@/lib/claude/artifact-registry';

export const dynamic = 'force-dynamic';

interface RegisterBody {
  paths?: unknown;
}

/**
 * Register one or more absolute paths as artifacts readable via
 * `/api/artifacts/raw`. Used by the client after ingesting Write/Edit
 * tool_use blocks so binary previews (pdf/docx/xlsx/pptx/image) keep working
 * even when the user switches to a different project. The registry is
 * in-process, so clients must also re-register persisted artifacts on
 * hydration.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req));
  if (!rl.ok) return apiError('Too many requests', 4429, 429);

  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return apiError('invalid json body', 4400, 400);
  }
  const raw = body.paths;
  const paths =
    Array.isArray(raw) && raw.every((p) => typeof p === 'string') ? (raw as string[]) : null;
  if (!paths || paths.length === 0) {
    return apiError('paths[] required', 4400, 400);
  }

  const registered: string[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const p of paths) {
    try {
      const stat = await fs.stat(p);
      if (!stat.isFile()) {
        skipped.push({ path: p, reason: 'not a file' });
        continue;
      }
      if (stat.size > MAX_BINARY_SIZE) {
        skipped.push({ path: p, reason: 'file too large' });
        continue;
      }
    } catch {
      skipped.push({ path: p, reason: 'not found' });
      continue;
    }
    const result = registerArtifactPath(p);
    if (result.ok) {
      registered.push(p);
    } else {
      skipped.push({ path: p, reason: result.reason ?? 'rejected' });
    }
  }

  try {
    return Response.json({ registered, skipped });
  } catch (err) {
    return handleApiError(err);
  }
}
