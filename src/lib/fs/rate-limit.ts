interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 300;

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
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded || req.headers.get('x-real-ip') || 'local';
}
