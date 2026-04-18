import { describe, it, expect } from 'vitest';
import {
  extractHeadingLevels,
  extractIds,
  extractTableRowCounts,
  compareArrays,
  compareIdSets,
  formatReport,
  // @ts-expect-error — .mjs import without type declarations.
} from '../../scripts/docs-audit.mjs';

describe('extractHeadingLevels', () => {
  it('captures ATX heading levels in order', () => {
    const src = [
      '# Top',
      '## Sub A',
      'prose',
      '### Deep',
      '## Sub B',
    ].join('\n');
    expect(extractHeadingLevels(src)).toEqual([1, 2, 3, 2]);
  });

  it('ignores # inside fenced code blocks', () => {
    const src = ['# Real', '```md', '## Not a heading', '```', '## Real too'].join('\n');
    expect(extractHeadingLevels(src)).toEqual([1, 2]);
  });

  it('requires a non-empty text after the hashes', () => {
    const src = ['#   ', '##', '# Good'].join('\n');
    expect(extractHeadingLevels(src)).toEqual([1]);
  });
});

describe('extractIds', () => {
  it('returns a Set of FR/NFR/ADR/UC ids', () => {
    const src = 'See FR-100 and NFR-502; also ADR-028 and UC-3.';
    expect([...extractIds(src)].sort()).toEqual(['ADR-028', 'FR-100', 'NFR-502', 'UC-3']);
  });

  it('deduplicates repeated ids', () => {
    const src = 'FR-10 FR-10 FR-11';
    expect([...extractIds(src)].sort()).toEqual(['FR-10', 'FR-11']);
  });

  it('does not match unrelated tokens', () => {
    const src = 'CR-100 TODO-1 FR- FR-abc';
    expect([...extractIds(src)]).toEqual([]);
  });
});

describe('extractTableRowCounts', () => {
  it('counts contiguous |-prefixed lines as one table each', () => {
    const src = [
      '# Heading',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      'Some prose.',
      '',
      '| c |',
      '| - |',
    ].join('\n');
    expect(extractTableRowCounts(src)).toEqual([3, 2]);
  });

  it('ignores tables inside code fences', () => {
    const src = [
      '```md',
      '| fake | table |',
      '| ---- | ----- |',
      '```',
      '| real |',
      '| ---- |',
    ].join('\n');
    expect(extractTableRowCounts(src)).toEqual([2]);
  });

  it('returns empty list when there are no tables', () => {
    expect(extractTableRowCounts('just prose\n\nand more prose')).toEqual([]);
  });
});

describe('compareArrays', () => {
  it('is ok for equal arrays', () => {
    expect(compareArrays([1, 2, 3], [1, 2, 3])).toEqual({ ok: true });
  });

  it('flags length differences', () => {
    expect(compareArrays([1, 2], [1, 2, 3]).ok).toBe(false);
  });

  it('flags first differing index', () => {
    const res = compareArrays(['a', 'b', 'c'], ['a', 'x', 'c']);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('index 1');
  });
});

describe('compareIdSets', () => {
  it('is ok when both sets are equal', () => {
    const a = new Set(['FR-1', 'FR-2']);
    const b = new Set(['FR-2', 'FR-1']);
    expect(compareIdSets(a, b)).toEqual({ ok: true });
  });

  it('reports only-in-KO ids', () => {
    const res = compareIdSets(new Set(['FR-1', 'FR-2']), new Set(['FR-2']));
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('only-in-KO: FR-1');
  });

  it('reports only-in-EN ids', () => {
    const res = compareIdSets(new Set(['FR-1']), new Set(['FR-1', 'FR-2']));
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('only-in-EN: FR-2');
  });
});

describe('formatReport', () => {
  it('emits OK and driftCount=0 when everything is in sync', () => {
    const r = formatReport([
      { pair: ['a.md', 'b.md'], issues: [] },
      { pair: ['c.md', 'd.md'], issues: [] },
    ]);
    expect(r.driftCount).toBe(0);
    expect(r.text).toContain('OK');
  });

  it('emits DRIFT lines for each drifted pair', () => {
    const r = formatReport([
      { pair: ['a.md', 'b.md'], issues: [{ kind: 'stable-ids', detail: 'only-in-KO: FR-1' }] },
      { pair: ['c.md', 'd.md'], issues: [] },
    ]);
    expect(r.driftCount).toBe(1);
    expect(r.text).toContain('DRIFT: a.md ↔ b.md');
    expect(r.text).toContain('stable-ids');
  });
});
