import { NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import { apiError, handleApiError } from '@/lib/fs/errors';
import { MAX_BINARY_SIZE } from '@/lib/fs/file-operations';
import { rateLimit, clientKey } from '@/lib/fs/rate-limit';
import { isArtifactPathRegistered } from '@/lib/claude/artifact-registry';

export const dynamic = 'force-dynamic';

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  html: 'text/html',
  htm: 'text/html',
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function guessMime(p: string): string {
  const ext = p.split('.').pop()?.toLowerCase() ?? '';
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

/**
 * Serve the bytes of a previously registered artifact, bypassing the
 * project-scoped `resolveSafe` sandbox used by `/api/files/raw`. This is how
 * the artifact gallery keeps previewing binary files (pdf/docx/xlsx/pptx/
 * image) after the user switches to a different project: the path was
 * allowlisted at capture time, so it can still be read.
 *
 * Security: only paths previously admitted through `/api/artifacts/register`
 * (which itself only registers files that actually exist and are under the
 * 50 MB cap) can be read here.
 */
export async function GET(req: NextRequest) {
  const rl = rateLimit(clientKey(req));
  if (!rl.ok) return apiError('Too many requests', 4429, 429);

  const p = req.nextUrl.searchParams.get('path');
  if (!p) return apiError('path required', 4400, 400);

  if (!isArtifactPathRegistered(p)) {
    return apiError('artifact not registered', 4404, 404);
  }

  try {
    const stat = await fs.stat(p);
    if (stat.size > MAX_BINARY_SIZE) {
      return apiError('File too large', 4413, 413);
    }
    const buf = await fs.readFile(p);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'content-type': guessMime(p),
        'content-length': String(stat.size),
        'cache-control': 'no-cache',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
