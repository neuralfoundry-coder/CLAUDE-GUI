import path from 'node:path';

/**
 * Server-side registry of absolute file paths that were captured as
 * "Generated Content" artifacts in the current session. A path only becomes
 * readable via `/api/artifacts/raw` after it has been registered here — the
 * registry is how we allow cross-project binary previews without loosening
 * the main project-scoped `resolveSafe` sandbox used by `/api/files/raw`.
 *
 * The registry is in-process and ephemeral: server restarts drop it, and the
 * client is responsible for re-registering any file-backed artifacts it
 * rehydrates from `localStorage`.
 */

interface Entry {
  registeredAt: number;
}

const MAX_ENTRIES = 1024;
const registry = new Map<string, Entry>();

function normalize(p: string): string {
  return path.normalize(p);
}

export function registerArtifactPath(absPath: string): { ok: boolean; reason?: string } {
  if (typeof absPath !== 'string' || absPath.length === 0) {
    return { ok: false, reason: 'path required' };
  }
  if (!path.isAbsolute(absPath)) {
    return { ok: false, reason: 'absolute path required' };
  }
  const norm = normalize(absPath);
  // Drop the oldest entry if the cap is hit so runaway sessions can't grow
  // the allowlist unboundedly.
  if (!registry.has(norm) && registry.size >= MAX_ENTRIES) {
    const firstKey = registry.keys().next().value;
    if (firstKey) registry.delete(firstKey);
  }
  registry.set(norm, { registeredAt: Date.now() });
  return { ok: true };
}

export function isArtifactPathRegistered(absPath: string): boolean {
  if (typeof absPath !== 'string') return false;
  return registry.has(normalize(absPath));
}

export function clearArtifactRegistry(): void {
  registry.clear();
}

export function listArtifactPaths(): string[] {
  return Array.from(registry.keys());
}
