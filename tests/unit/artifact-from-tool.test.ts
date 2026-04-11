import { describe, it, expect } from 'vitest';
import {
  artifactFromWrite,
  artifactFromEdit,
  applyEditOps,
} from '@/lib/claude/artifact-from-tool';
import { classifyByPath, isBinaryKind } from '@/lib/claude/artifact-extractor';

const ctx = { messageId: 'm-1', sessionId: 's-1', now: 1_700_000_000_000 };

describe('classifyByPath', () => {
  it('maps common extensions to kinds', () => {
    expect(classifyByPath('/tmp/deck.html')).toBe('html');
    expect(classifyByPath('/tmp/icon.svg')).toBe('svg');
    expect(classifyByPath('/tmp/README.md')).toBe('markdown');
    expect(classifyByPath('/tmp/a.png')).toBe('image');
    expect(classifyByPath('/tmp/a.jpeg')).toBe('image');
    expect(classifyByPath('/tmp/doc.pdf')).toBe('pdf');
    expect(classifyByPath('/tmp/resume.docx')).toBe('docx');
    expect(classifyByPath('/tmp/sheet.xlsx')).toBe('xlsx');
    expect(classifyByPath('/tmp/deck.pptx')).toBe('pptx');
    expect(classifyByPath('/tmp/script.ts')).toBe('code');
    expect(classifyByPath('/tmp/plain')).toBe('text');
  });
});

describe('isBinaryKind', () => {
  it('marks non-text formats as binary', () => {
    expect(isBinaryKind('pdf')).toBe(true);
    expect(isBinaryKind('docx')).toBe(true);
    expect(isBinaryKind('xlsx')).toBe(true);
    expect(isBinaryKind('pptx')).toBe(true);
    expect(isBinaryKind('image')).toBe(true);
    expect(isBinaryKind('html')).toBe(false);
    expect(isBinaryKind('markdown')).toBe(false);
    expect(isBinaryKind('code')).toBe(false);
  });
});

describe('artifactFromWrite', () => {
  it('returns null for non-Write tool', () => {
    expect(artifactFromWrite({ name: 'Bash', input: {} }, ctx)).toBeNull();
  });

  it('captures inline text content for html slides', () => {
    const tool = {
      name: 'Write',
      input: {
        file_path: '/proj/slides/slide5.html',
        content: '<!doctype html><html><body>Slide 5</body></html>',
      },
    };
    const art = artifactFromWrite(tool, ctx);
    expect(art).not.toBeNull();
    expect(art?.kind).toBe('html');
    expect(art?.source).toBe('inline');
    expect(art?.content).toContain('Slide 5');
    expect(art?.filePath).toBe('/proj/slides/slide5.html');
    expect(art?.title).toBe('slide5.html');
    expect(art?.id).toBe('file:/proj/slides/slide5.html');
  });

  it('uses file source for binary formats', () => {
    const tool = {
      name: 'Write',
      input: { file_path: '/proj/report.pptx', content: 'irrelevant' },
    };
    const art = artifactFromWrite(tool, ctx);
    expect(art?.kind).toBe('pptx');
    expect(art?.source).toBe('file');
    expect(art?.content).toBe('');
    expect(art?.filePath).toBe('/proj/report.pptx');
  });

  it('ignores Write calls without file_path', () => {
    expect(artifactFromWrite({ name: 'Write', input: { content: 'x' } }, ctx)).toBeNull();
  });

  it('assigns stable ids by path so repeat writes collapse', () => {
    const t1 = { name: 'Write', input: { file_path: '/p/a.md', content: '# Title one' } };
    const t2 = { name: 'Write', input: { file_path: '/p/a.md', content: '# Title two' } };
    const a1 = artifactFromWrite(t1, ctx)!;
    const a2 = artifactFromWrite(t2, ctx)!;
    expect(a1.id).toBe(a2.id);
  });
});

describe('applyEditOps', () => {
  it('applies sequential replacements', () => {
    const out = applyEditOps('hello world', [
      { oldString: 'hello', newString: 'hi', replaceAll: false },
      { oldString: 'world', newString: 'there', replaceAll: false },
    ]);
    expect(out).toBe('hi there');
  });

  it('supports replaceAll', () => {
    const out = applyEditOps('foo foo foo', [{ oldString: 'foo', newString: 'bar', replaceAll: true }]);
    expect(out).toBe('bar bar bar');
  });
});

describe('artifactFromEdit', () => {
  const baseline = {
    id: 'file:/p/a.html',
    messageId: 'm-0',
    sessionId: 's-1',
    index: 0,
    language: 'html',
    kind: 'html' as const,
    title: 'a.html',
    content: '<html><body>hello world</body></html>',
    filePath: '/p/a.html',
    source: 'inline' as const,
    createdAt: 1,
    updatedAt: 1,
  };

  it('applies an Edit against the existing artifact', () => {
    const tool = {
      name: 'Edit',
      input: { file_path: '/p/a.html', old_string: 'hello', new_string: 'hi' },
    };
    const updated = artifactFromEdit(tool, ctx, baseline);
    expect(updated?.content).toContain('hi world');
    expect(updated?.updatedAt).toBe(ctx.now);
    expect(updated?.createdAt).toBe(1);
  });

  it('returns null when baseline is missing for an inline artifact', () => {
    const tool = {
      name: 'Edit',
      input: { file_path: '/p/a.html', old_string: 'hello', new_string: 'hi' },
    };
    expect(artifactFromEdit(tool, ctx, null)).toBeNull();
  });

  it('refreshes updatedAt on binary file-backed artifacts without touching content', () => {
    const binaryBaseline = {
      ...baseline,
      kind: 'pptx' as const,
      source: 'file' as const,
      content: '',
      filePath: '/p/deck.pptx',
    };
    const tool = {
      name: 'Edit',
      input: { file_path: '/p/deck.pptx', old_string: 'x', new_string: 'y' },
    };
    const updated = artifactFromEdit(tool, ctx, binaryBaseline);
    expect(updated?.content).toBe('');
    expect(updated?.updatedAt).toBe(ctx.now);
  });
});
