import { NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import { resolveSafe } from '@/lib/fs/resolve-safe';
import { apiError, apiSuccess, handleApiError } from '@/lib/fs/errors';
import { rateLimit, clientKey } from '@/lib/fs/rate-limit';
import { countOccurrences, replaceAllLiteral } from '@/lib/fs/replace-logic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Per-file size cap — replace refuses anything over 1MB. */
const MAX_FILE_SIZE = 1024 * 1024;
/** Hard cap on the number of files a single call can touch. */
const MAX_FILES = 200;

interface ReplaceRequestBody {
  query?: string;
  replace?: string;
  caseSensitive?: boolean;
  files?: unknown;
  dryRun?: boolean;
}

interface FileResult {
  path: string;
  replacements: number;
  status: 'ok' | 'skipped' | 'error';
  error?: string;
  preview?: { before: string; after: string } | null;
}

/**
 * POST /api/files/replace
 *
 * Body:
 *   - query:         literal substring to search for
 *   - replace:       replacement string
 *   - caseSensitive: default true
 *   - files:         string[] of project-relative paths to modify
 *   - dryRun:        default true; no writes. Returns replacement counts + a
 *                    short before/after preview (first match only) per file.
 *
 * Path safety: every entry in `files` is routed through `resolveSafe`, so
 * traversal and dotfile access are rejected by the same guards as /read, /write.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req));
  if (!rl.ok) return apiError('Too many requests', 4429, 429);

  let body: ReplaceRequestBody;
  try {
    body = (await req.json()) as ReplaceRequestBody;
  } catch {
    return apiError('Invalid JSON', 4400, 400);
  }

  const { query, replace, caseSensitive = true, dryRun = true } = body;
  if (typeof query !== 'string' || query.length === 0) {
    return apiError('query required', 4400, 400);
  }
  if (typeof query !== 'string' || query.length > 2000) {
    return apiError('query too long (max 2000 chars)', 4400, 400);
  }
  if (typeof replace !== 'string') {
    return apiError('replace required', 4400, 400);
  }
  if (replace.length > 2000) {
    return apiError('replace too long (max 2000 chars)', 4400, 400);
  }
  if (!Array.isArray(body.files)) {
    return apiError('files[] required', 4400, 400);
  }
  const files = body.files.filter((f): f is string => typeof f === 'string' && f.length > 0);
  if (files.length === 0) {
    return apiError('files[] must contain at least one path', 4400, 400);
  }
  if (files.length > MAX_FILES) {
    return apiError(`too many files (max ${MAX_FILES})`, 4400, 400);
  }

  const results: FileResult[] = [];
  let totalReplacements = 0;
  let filesChanged = 0;

  for (const rel of files) {
    try {
      const abs = await resolveSafe(rel);
      const stat = await fs.stat(abs);
      if (!stat.isFile()) {
        results.push({ path: rel, replacements: 0, status: 'skipped', error: 'not a regular file' });
        continue;
      }
      if (stat.size > MAX_FILE_SIZE) {
        results.push({ path: rel, replacements: 0, status: 'skipped', error: 'file too large' });
        continue;
      }
      const original = await fs.readFile(abs, 'utf8');
      const count = countOccurrences(original, query, caseSensitive);
      if (count === 0) {
        results.push({ path: rel, replacements: 0, status: 'skipped' });
        continue;
      }
      const modified = replaceAllLiteral(original, query, replace, caseSensitive);
      let preview: FileResult['preview'] = null;
      const firstMatch = caseSensitive
        ? original.indexOf(query)
        : original.toLowerCase().indexOf(query.toLowerCase());
      if (firstMatch !== -1) {
        const ctx = 40;
        const start = Math.max(0, firstMatch - ctx);
        const end = Math.min(original.length, firstMatch + query.length + ctx);
        preview = {
          before: original.slice(start, end),
          after: replaceAllLiteral(original.slice(start, end), query, replace, caseSensitive),
        };
      }
      if (!dryRun) {
        await fs.writeFile(abs, modified, 'utf8');
      }
      results.push({ path: rel, replacements: count, status: 'ok', preview });
      totalReplacements += count;
      filesChanged += 1;
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'ENOENT') {
        results.push({ path: rel, replacements: 0, status: 'error', error: 'not found' });
      } else {
        results.push({ path: rel, replacements: 0, status: 'error', error: e.message ?? 'unknown' });
      }
    }
  }

  try {
    return apiSuccess({
      dryRun,
      totalReplacements,
      filesChanged,
      filesScanned: files.length,
      results,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
