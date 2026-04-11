import { describe, expect, it } from 'vitest';
import {
  detectMention,
  filterMentionCandidates,
} from '@/components/panels/claude/use-file-mentions';
import type { ProjectFileItem } from '@/lib/fs/list-project-files';

describe('detectMention', () => {
  it('detects mention at start of text', () => {
    expect(detectMention('@src', 4)).toEqual({ start: 0, query: 'src' });
  });

  it('detects mention after whitespace', () => {
    expect(detectMention('hello @src', 10)).toEqual({ start: 6, query: 'src' });
  });

  it('detects mention after newline', () => {
    expect(detectMention('line one\n@foo', 13)).toEqual({ start: 9, query: 'foo' });
  });

  it('returns empty query for bare @', () => {
    expect(detectMention('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('returns null for email-like @ (no leading whitespace)', () => {
    expect(detectMention('user@example', 12)).toBeNull();
  });

  it('returns null when whitespace intervenes between @ and cursor', () => {
    expect(detectMention('@src rest', 9)).toBeNull();
  });

  it('returns null when cursor is before any @', () => {
    expect(detectMention('hello world', 5)).toBeNull();
  });

  it('uses cursor to slice query (ignores text after cursor)', () => {
    expect(detectMention('@source-code', 4)).toEqual({ start: 0, query: 'sou' });
  });
});

describe('filterMentionCandidates', () => {
  const entries: ProjectFileItem[] = [
    { path: 'src/app/page.tsx', name: 'page.tsx', type: 'file' },
    { path: 'src/components/button.tsx', name: 'button.tsx', type: 'file' },
    { path: 'src/lib/utils.ts', name: 'utils.ts', type: 'file' },
    { path: 'src/stores', name: 'stores', type: 'directory' },
    { path: 'tests/unit', name: 'unit', type: 'directory' },
    { path: 'README.md', name: 'README.md', type: 'file' },
  ];

  it('returns all matching entries for empty query', () => {
    const result = filterMentionCandidates(entries, '');
    expect(result.length).toBe(entries.length);
  });

  it('ranks prefix matches above substring matches', () => {
    const result = filterMentionCandidates(entries, 'src');
    expect(result[0]?.path.startsWith('src')).toBe(true);
  });

  it('ranks basename prefix matches highly', () => {
    const result = filterMentionCandidates(entries, 'button');
    expect(result[0]?.path).toBe('src/components/button.tsx');
  });

  it('supports subsequence matching as a fallback', () => {
    const result = filterMentionCandidates(entries, 'spt');
    const paths = result.map((r) => r.path);
    expect(paths).toContain('src/app/page.tsx');
  });

  it('filters out non-matching entries', () => {
    const result = filterMentionCandidates(entries, 'zzznomatch');
    expect(result).toEqual([]);
  });
});
