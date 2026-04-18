import { describe, it, expect } from 'vitest';
import { countOccurrences, replaceAllLiteral } from '@/lib/fs/replace-logic';

describe('countOccurrences', () => {
  it('counts non-overlapping literal matches (case-sensitive)', () => {
    expect(countOccurrences('foo bar foo baz foo', 'foo', true)).toBe(3);
  });

  it('respects case when caseSensitive=true', () => {
    expect(countOccurrences('Foo FOO foo', 'foo', true)).toBe(1);
  });

  it('is case-insensitive when caseSensitive=false', () => {
    expect(countOccurrences('Foo FOO foo', 'foo', false)).toBe(3);
  });

  it('returns 0 for empty needle', () => {
    expect(countOccurrences('anything', '', true)).toBe(0);
  });

  it('does not over-count overlapping substrings (advances by needle length)', () => {
    expect(countOccurrences('aaaa', 'aa', true)).toBe(2);
  });
});

describe('replaceAllLiteral', () => {
  it('replaces every case-sensitive occurrence', () => {
    expect(replaceAllLiteral('foo bar foo', 'foo', 'BAZ', true)).toBe('BAZ bar BAZ');
  });

  it('leaves non-matching case untouched when caseSensitive=true', () => {
    expect(replaceAllLiteral('Foo foo', 'foo', 'X', true)).toBe('Foo X');
  });

  it('replaces every case-insensitive occurrence while preserving the original casing of NON-matches', () => {
    expect(replaceAllLiteral('Foo FOO foo', 'foo', 'X', false)).toBe('X X X');
    expect(replaceAllLiteral('Hello World', 'foo', 'X', false)).toBe('Hello World');
  });

  it('returns the input unchanged for empty needle', () => {
    expect(replaceAllLiteral('abc', '', 'X', true)).toBe('abc');
  });

  it('handles a replacement that contains the needle without infinite looping', () => {
    expect(replaceAllLiteral('foo', 'foo', 'foofoo', true)).toBe('foofoo');
  });

  it('handles a needle at the very end', () => {
    expect(replaceAllLiteral('abcX', 'X', 'Y', true)).toBe('abcY');
  });

  it('handles multiple case-insensitive matches with mixed casing around them', () => {
    expect(replaceAllLiteral('aFOObAR Foo', 'foo', '--', false)).toBe('a--bAR --');
  });
});
