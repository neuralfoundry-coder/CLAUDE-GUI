import { describe, it, expect } from 'vitest';
import { extractArtifacts, extensionFor } from '@/lib/claude/artifact-extractor';

describe('extractArtifacts', () => {
  const opts = { messageId: 'm1', sessionId: 's1', now: 1_700_000_000_000 };

  it('returns empty for text with no fenced blocks or raw html/svg', () => {
    expect(extractArtifacts('just a paragraph.', opts)).toEqual([]);
  });

  it('extracts a fenced typescript block as code', () => {
    const text = 'Here is some code:\n\n```ts\nexport const hello = () => "hi world";\n```';
    const result = extractArtifacts(text, opts);
    expect(result).toHaveLength(1);
    const [first] = result;
    expect(first).toBeDefined();
    expect(first).toMatchObject({
      messageId: 'm1',
      sessionId: 's1',
      language: 'ts',
      kind: 'code',
      id: 'm1:1',
    });
    expect(first?.content).toContain('export const hello');
  });

  it('classifies html, svg, markdown fenced blocks', () => {
    const text = [
      '```html',
      '<!doctype html><html><head><title>My Page</title></head><body>hi</body></html>',
      '```',
      '',
      '```svg',
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="40"/></svg>',
      '```',
      '',
      '```md',
      '# My Doc\n\nA sample markdown document body.',
      '```',
    ].join('\n');
    const result = extractArtifacts(text, opts);
    expect(result.map((a) => a.kind)).toEqual(['html', 'svg', 'markdown']);
    expect(result[0]?.title).toBe('My Page');
    expect(result[2]?.title).toBe('My Doc');
  });

  it('picks up raw <svg> outside of fences', () => {
    const text = 'Here is an icon: <svg width="16" height="16"><rect x="0" y="0"/></svg> done.';
    const result = extractArtifacts(text, opts);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('svg');
  });

  it('does not double-extract raw html already inside a fence', () => {
    const text = '```html\n<!doctype html><html><body>hello world here</body></html>\n```';
    const result = extractArtifacts(text, opts);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('html');
  });

  it('skips tiny blocks below the minimum length', () => {
    const text = '```js\nx\n```';
    const result = extractArtifacts(text, opts);
    expect(result).toEqual([]);
  });

  it('assigns stable ids per message+index', () => {
    const text = '```py\nprint("hello world this is long enough")\n```\n\n```py\ndef foo(): return 42 + 1\n```';
    const result = extractArtifacts(text, opts);
    expect(result.map((a) => a.id)).toEqual(['m1:1', 'm1:2']);
  });
});

describe('extensionFor', () => {
  it('maps common languages', () => {
    expect(extensionFor('typescript', 'code')).toBe('ts');
    expect(extensionFor('python', 'code')).toBe('py');
    expect(extensionFor('rust', 'code')).toBe('rs');
  });

  it('falls back by kind when language is unknown', () => {
    expect(extensionFor('', 'html')).toBe('html');
    expect(extensionFor('', 'svg')).toBe('svg');
    expect(extensionFor('', 'markdown')).toBe('md');
    expect(extensionFor('', 'code')).toBe('txt');
  });
});
