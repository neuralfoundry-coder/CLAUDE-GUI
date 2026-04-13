interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
/**
 * The file API rate limit is primarily a defense against misbehaving
 * clients or external callers — for a single local desktop user, a
 * reasonable project crawl (Cmd+P / `@` autocomplete / file tree expand)
 * can legitimately burst into the thousands of requests when opening a
 * large repo with deeply nested directories. 6000 req/min (~100 req/sec
 * sustained) comfortably covers that while still cutting off runaway loops.
 * Each browser tab gets its own bucket via browserId in clientKey().
 */
const MAX_REQUESTS = 6000;

export function rateLimit(key: string): { ok: boolean; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_REQUESTS - 1 };
  }
  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS) return { ok: false, remaining: 0 };
  return { ok: true, remaining: MAX_REQUESTS - bucket.count };
}

export function clientKey(req: Request): string {
  const browserId = req.headers.get('x-browser-id');
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'local';
  return browserId ? `${ip}:${browserId}` : ip;
}
