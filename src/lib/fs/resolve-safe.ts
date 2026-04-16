import path from 'node:path';
import fs from 'node:fs/promises';
import { headers } from 'next/headers';
import { getActiveRoot } from '@/lib/project/project-context.mjs';
import { browserSessionRegistry } from '@/lib/project/browser-session-registry.mjs';

export class SandboxError extends Error {
  readonly code: number;
  constructor(message: string, code = 4403) {
    super(message);
    this.name = 'SandboxError';
    this.code = code;
  }
}

const DENIED_SEGMENTS = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.git',
  '.ssh',
  '.claude',
  '.aws',
  '.npmrc',
  'id_rsa',
  'id_ed25519',
  'credentials',
]);

/**
 * Get the project root for the given browser session.
 * When called from a Next.js API route, automatically reads the
 * `x-browser-id` header to resolve the correct per-tab root.
 * Falls back to the global singleton when browserId is absent.
 */
export async function getProjectRoot(browserId?: string | null): Promise<string> {
  let bid = browserId ?? null;
  if (!bid) {
    // Attempt to read from Next.js request headers (works inside API routes).
    try {
      const hdrs = await headers();
      bid = hdrs.get('x-browser-id') || null;
    } catch {
      // Not in a Next.js request context — fall through to global root.
    }
  }
  const root = bid ? browserSessionRegistry.getRoot(bid) : getActiveRoot();
  if (!root) {
    throw new SandboxError('No project is open', 4412);
  }
  return root;
}

function isDeniedSegment(segment: string): boolean {
  if (DENIED_SEGMENTS.has(segment)) return true;
  if (segment.startsWith('.env.')) return true;
  return false;
}

export async function resolveSafe(userPath: string, projectRoot?: string): Promise<string> {
  const root = projectRoot ?? await getProjectRoot();
  if (typeof userPath !== 'string') {
    throw new SandboxError('path must be a string', 4400);
  }

  const normalized = userPath.trim();
  if (normalized === '') {
    return root;
  }

  const resolved = path.resolve(root, normalized);
  const rel = path.relative(root, resolved);

  if (rel === '') return resolved;
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new SandboxError('Path outside project root');
  }

  for (const segment of rel.split(path.sep)) {
    if (isDeniedSegment(segment)) {
      throw new SandboxError(`Access denied: ${segment}`);
    }
  }

  try {
    const stat = await fs.lstat(resolved);
    if (stat.isSymbolicLink()) {
      const target = await fs.readlink(resolved);
      const targetAbs = path.resolve(path.dirname(resolved), target);
      const targetRel = path.relative(root, targetAbs);
      if (targetRel.startsWith('..') || path.isAbsolute(targetRel)) {
        throw new SandboxError('Symlink points outside project root');
      }
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') {
      if (err instanceof SandboxError) throw err;
    }
  }

  return resolved;
}
