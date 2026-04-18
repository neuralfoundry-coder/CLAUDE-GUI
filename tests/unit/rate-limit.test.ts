import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  rateLimit,
  clientKey,
  __resetRateLimitForTests,
  __rateLimitBucketCount,
} from '@/lib/fs/rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-18T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the cap', () => {
    const first = rateLimit('client-a');
    expect(first.ok).toBe(true);
    expect(first.remaining).toBe(5999);
    const second = rateLimit('client-a');
    expect(second.ok).toBe(true);
    expect(second.remaining).toBe(5998);
  });

  it('rejects requests over the cap within the window', () => {
    for (let i = 0; i < 6000; i += 1) rateLimit('client-b');
    const over = rateLimit('client-b');
    expect(over.ok).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it('resets the bucket after the window elapses', () => {
    rateLimit('client-c');
    expect(__rateLimitBucketCount()).toBe(1);
    vi.advanceTimersByTime(61_000);
    const after = rateLimit('client-c');
    expect(after.ok).toBe(true);
    expect(after.remaining).toBe(5999);
  });

  it('GCs expired buckets after the 5-minute sweep interval', () => {
    // Fill many distinct buckets so the Map grows.
    for (let i = 0; i < 50; i += 1) rateLimit(`client-${i}`);
    expect(__rateLimitBucketCount()).toBe(50);

    // Advance past the window so all buckets are expired, then past the GC interval.
    vi.advanceTimersByTime(6 * 60_000);
    // One triggering call sweeps the map and seeds its own fresh bucket.
    rateLimit('sweeper');
    expect(__rateLimitBucketCount()).toBe(1);
  });

  it('does not GC on every call (sweep is throttled to 5min intervals)', () => {
    for (let i = 0; i < 10; i += 1) rateLimit(`client-${i}`);
    vi.advanceTimersByTime(61_000); // buckets are expired but within GC interval
    rateLimit('trigger-a');
    // Expired buckets stay in the map until the GC interval ticks.
    expect(__rateLimitBucketCount()).toBe(11);
  });
});

describe('clientKey', () => {
  function makeReq(headers: Record<string, string>): Request {
    return new Request('http://localhost/test', { headers });
  }

  it('combines x-forwarded-for with browser id', () => {
    expect(clientKey(makeReq({ 'x-forwarded-for': '1.2.3.4', 'x-browser-id': 'tab-1' }))).toBe(
      '1.2.3.4:tab-1',
    );
  });

  it('falls back to "local" when no IP headers are present', () => {
    expect(clientKey(makeReq({}))).toBe('local');
  });

  it('prefers x-real-ip when x-forwarded-for is missing', () => {
    expect(clientKey(makeReq({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8');
  });
});
