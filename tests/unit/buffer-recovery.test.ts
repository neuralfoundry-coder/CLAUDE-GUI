import { describe, it, expect, beforeEach } from 'vitest';
import {
  discardAllBuffers,
  discardBuffer,
  getStashedBuffers,
  stashBuffer,
} from '@/lib/editor/buffer-recovery';

describe('buffer-recovery', () => {
  beforeEach(() => {
    discardAllBuffers();
  });

  it('stores and retrieves a buffer', () => {
    stashBuffer('src/a.ts', 'hello');
    const all = getStashedBuffers();
    expect(all).toHaveLength(1);
    expect(all[0]!.path).toBe('src/a.ts');
    expect(all[0]!.content).toBe('hello');
    expect(typeof all[0]!.savedAt).toBe('number');
  });

  it('upserts on the same path (no duplicates)', () => {
    stashBuffer('src/a.ts', 'v1');
    stashBuffer('src/a.ts', 'v2');
    const all = getStashedBuffers();
    expect(all).toHaveLength(1);
    expect(all[0]!.content).toBe('v2');
  });

  it('keeps distinct paths independent', () => {
    stashBuffer('a.ts', 'A');
    stashBuffer('b.ts', 'B');
    const all = getStashedBuffers();
    expect(all).toHaveLength(2);
    expect(all.map((b) => b.path).sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('discards a single buffer by path', () => {
    stashBuffer('a.ts', 'A');
    stashBuffer('b.ts', 'B');
    discardBuffer('a.ts');
    const all = getStashedBuffers();
    expect(all).toHaveLength(1);
    expect(all[0]!.path).toBe('b.ts');
  });

  it('discards all buffers', () => {
    stashBuffer('a.ts', 'A');
    stashBuffer('b.ts', 'B');
    discardAllBuffers();
    expect(getStashedBuffers()).toHaveLength(0);
  });

  it('drops oversized content without storing it, and clears any prior stash for that path', () => {
    stashBuffer('big.ts', 'small version');
    const oversized = 'x'.repeat(257 * 1024);
    stashBuffer('big.ts', oversized);
    // The prior stash is discarded to avoid restoring stale content.
    expect(getStashedBuffers().find((b) => b.path === 'big.ts')).toBeUndefined();
  });

  it('returns empty array when storage is empty', () => {
    expect(getStashedBuffers()).toEqual([]);
  });
});
