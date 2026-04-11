import { NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import { resolveSafe } from '@/lib/fs/resolve-safe';
import { apiError, handleApiError } from '@/lib/fs/errors';
import { MAX_BINARY_SIZE } from '@/lib/fs/file-operations';
import { rateLimit, clientKey } from '@/lib/fs/rate-limit';

export const dynamic = 'force-dynamic';

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  html: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  json: 'application/json',
  txt: 'text/plain',
};

function guessMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(clientKey(req));
  if (!rl.ok) return apiError('Too many requests', 4429, 429);

  const p = req.nextUrl.searchParams.get('path');
  if (!p) return apiError('path required', 4400, 400);

  try {
    const abs = await resolveSafe(p);
    const stat = await fs.stat(abs);
    if (stat.size > MAX_BINARY_SIZE) {
      return apiError('File too large', 4413, 413);
    }
    const buf = await fs.readFile(abs);
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
