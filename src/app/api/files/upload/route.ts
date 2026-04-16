import { NextRequest } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSafe } from '@/lib/fs/resolve-safe';
import { apiError, apiSuccess, handleApiError } from '@/lib/fs/errors';
import { MAX_BINARY_SIZE } from '@/lib/fs/file-operations';
import { rateLimit, clientKey } from '@/lib/fs/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_TOTAL_UPLOAD = 200 * 1024 * 1024;

interface UploadedFile {
  name: string;
  size: number;
  writtenPath: string;
}

function isUnsafeBaseName(name: string): boolean {
  if (!name || name === '.' || name === '..') return true;
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) return true;
  return false;
}

/** Validate that declared MIME type is plausible for the file extension. */
const EXT_MIME_MAP: Record<string, string[]> = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
  '.svg': ['image/svg+xml'],
  '.pdf': ['application/pdf'],
  '.zip': ['application/zip', 'application/x-zip-compressed'],
  '.html': ['text/html'],
  '.htm': ['text/html'],
  '.css': ['text/css'],
  '.js': ['text/javascript', 'application/javascript'],
  '.json': ['application/json'],
  '.xml': ['text/xml', 'application/xml'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
};

/** Magic byte signatures for binary file types. */
const MAGIC_SIGNATURES: Array<{ ext: string[]; bytes: number[] }> = [
  { ext: ['.png'], bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: ['.jpg', '.jpeg'], bytes: [0xff, 0xd8, 0xff] },
  { ext: ['.gif'], bytes: [0x47, 0x49, 0x46] },
  { ext: ['.pdf'], bytes: [0x25, 0x50, 0x44, 0x46] },
  { ext: ['.zip', '.xlsx', '.docx', '.pptx'], bytes: [0x50, 0x4b, 0x03, 0x04] },
];

function validateMimeAndMagic(
  fileName: string,
  declaredType: string,
  buffer: Buffer,
): { valid: boolean; reason?: string } {
  const ext = path.extname(fileName).toLowerCase();

  // Check declared MIME vs extension (when we have a mapping)
  const expectedMimes = EXT_MIME_MAP[ext] as string[] | undefined;
  if (expectedMimes && declaredType && declaredType !== 'application/octet-stream') {
    const baseMime = declaredType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!expectedMimes.includes(baseMime)) {
      return { valid: false, reason: `MIME type ${baseMime} does not match extension ${ext}` };
    }
  }

  // Check magic bytes for known binary formats
  if (buffer.length >= 4) {
    for (const sig of MAGIC_SIGNATURES) {
      if (!sig.ext.includes(ext)) continue;
      const match = sig.bytes.every((b, i) => buffer[i] === b);
      if (!match) {
        return { valid: false, reason: `File content does not match expected ${ext} format` };
      }
    }
  }

  return { valid: true };
}

async function uniquePath(
  absDir: string,
  rawName: string,
): Promise<{ abs: string; name: string }> {
  const ext = path.extname(rawName);
  const base = path.basename(rawName, ext);
  let n = 0;
  // Bounded retry in case of a hostile filename collision loop.
  while (n < 100) {
    const name = n === 0 ? rawName : `${base} (${n})${ext}`;
    const abs = path.join(absDir, name);
    try {
      await fs.access(abs);
      n += 1;
    } catch {
      return { abs, name };
    }
  }
  throw new Error('Could not allocate a unique filename');
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req));
  if (!rl.ok) return apiError('Too many requests', 4429, 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError('Invalid multipart payload', 4400, 400);
  }

  const destDirRaw = form.get('destDir');
  const destDir = typeof destDirRaw === 'string' ? destDirRaw : '';

  const files: File[] = [];
  for (const value of form.getAll('files')) {
    if (value instanceof File) files.push(value);
  }
  if (files.length === 0) return apiError('No files provided', 4400, 400);

  let absDir: string;
  try {
    absDir = await resolveSafe(destDir);
  } catch (err) {
    return handleApiError(err);
  }

  try {
    const dirStat = await fs.lstat(absDir);
    if (!dirStat.isDirectory()) {
      return apiError('Destination is not a directory', 4400, 400);
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return apiError('Destination not found', 4404, 404);
    return handleApiError(err);
  }

  const uploaded: UploadedFile[] = [];
  let totalBytes = 0;

  try {
    for (const file of files) {
      const rawName = path.basename(file.name);
      if (isUnsafeBaseName(rawName)) {
        return apiError(`Invalid filename: ${file.name}`, 4400, 400);
      }
      if (file.size > MAX_BINARY_SIZE) {
        return apiError(`File too large: ${rawName}`, 4413, 413);
      }
      totalBytes += file.size;
      if (totalBytes > MAX_TOTAL_UPLOAD) {
        return apiError('Total upload size exceeded', 4413, 413);
      }

      const { abs: destAbs, name: finalName } = await uniquePath(absDir, rawName);

      // Defense-in-depth: make sure the resolved path is still inside the
      // destination directory (rejects any residual traversal from basename).
      const relCheck = path.relative(absDir, destAbs);
      if (!relCheck || relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
        return apiError('Resolved path escaped destination', 4403, 403);
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      // Validate MIME type and magic bytes
      const mimeCheck = validateMimeAndMagic(rawName, file.type, buffer);
      if (!mimeCheck.valid) {
        return apiError(`Upload rejected: ${mimeCheck.reason}`, 4400, 400);
      }

      await fs.writeFile(destAbs, buffer);

      const relFromRoot = (destDir ? `${destDir}/${finalName}` : finalName).replace(/\\/g, '/');
      uploaded.push({ name: finalName, size: file.size, writtenPath: relFromRoot });
    }
  } catch (err) {
    return handleApiError(err);
  }

  return apiSuccess({ uploaded });
}
