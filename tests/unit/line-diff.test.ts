import { describe, it, expect } from 'vitest';
import { computeHunks, applyHunks } from '@/lib/diff/line-diff';

describe('computeHunks', () => {
  it('returns empty when identical', () => {
    expect(computeHunks('a\nb\nc', 'a\nb\nc')).toEqual([]);
  });

  it('detects a single replacement hunk', () => {
    const hunks = computeHunks('a\nb\nc', 'a\nB\nc');
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.originalLines).toEqual(['b']);
    expect(hunks[0]!.modifiedLines).toEqual(['B']);
  });

  it('detects an insertion hunk', () => {
    const hunks = computeHunks('a\nb', 'a\nNEW\nb');
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.originalLines).toEqual([]);
    expect(hunks[0]!.modifiedLines).toEqual(['NEW']);
  });

  it('detects a deletion hunk', () => {
    const hunks = computeHunks('a\nb\nc', 'a\nc');
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.originalLines).toEqual(['b']);
    expect(hunks[0]!.modifiedLines).toEqual([]);
  });

  it('splits multiple separated changes into multiple hunks', () => {
    const hunks = computeHunks('a\nb\nc\nd\ne', 'A\nb\nc\nD\ne');
    expect(hunks.length).toBe(2);
  });
});

describe('applyHunks', () => {
  it('returns original when no hunks accepted', () => {
    const original = 'a\nb\nc';
    const modified = 'a\nB\nc';
    const hunks = computeHunks(original, modified);
    expect(applyHunks(original, hunks, new Set())).toBe(original);
  });

  it('returns full modified when all hunks accepted', () => {
    const original = 'a\nb\nc';
    const modified = 'a\nB\nc';
    const hunks = computeHunks(original, modified);
    const acceptedIds = new Set(hunks.map((h) => h.id));
    expect(applyHunks(original, hunks, acceptedIds)).toBe(modified);
  });

  it('applies only accepted hunks among multiple', () => {
    const original = 'a\nb\nc\nd\ne';
    const modified = 'A\nb\nc\nD\ne';
    const hunks = computeHunks(original, modified);
    // Accept only the second hunk
    const acceptedIds = new Set([hunks[1]!.id]);
    const result = applyHunks(original, hunks, acceptedIds);
    expect(result).toBe('a\nb\nc\nD\ne');
  });

  it('preserves trailing unchanged lines', () => {
    const original = 'x\ny\nz';
    const modified = 'X\ny\nz';
    const hunks = computeHunks(original, modified);
    const acceptedIds = new Set(hunks.map((h) => h.id));
    expect(applyHunks(original, hunks, acceptedIds)).toBe('X\ny\nz');
  });
});
