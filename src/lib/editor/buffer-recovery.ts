const STORAGE_KEY = 'claudegui-editor-recovery';
/** Per-buffer cap. Larger buffers are silently dropped to avoid localStorage quota churn. */
const MAX_CONTENT_BYTES = 256 * 1024;

export interface StashedBuffer {
  path: string;
  content: string;
  savedAt: number;
}

function getStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readAll(): StashedBuffer[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StashedBuffer[]) : [];
  } catch {
    return [];
  }
}

function writeAll(buffers: StashedBuffer[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (buffers.length === 0) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, JSON.stringify(buffers));
  } catch {
    /* quota exceeded — silently drop; recovery is best-effort */
  }
}

/** Upsert a dirty buffer into the recovery stash. No-op for oversized content. */
export function stashBuffer(path: string, content: string): void {
  if (content.length > MAX_CONTENT_BYTES) {
    // Content too large — drop any prior stash for this path so we don't
    // restore a stale, smaller version.
    discardBuffer(path);
    return;
  }
  const all = readAll().filter((b) => b.path !== path);
  all.push({ path, content, savedAt: Date.now() });
  writeAll(all);
}

export function discardBuffer(path: string): void {
  const all = readAll().filter((b) => b.path !== path);
  writeAll(all);
}

export function discardAllBuffers(): void {
  writeAll([]);
}

export function getStashedBuffers(): StashedBuffer[] {
  return readAll();
}
