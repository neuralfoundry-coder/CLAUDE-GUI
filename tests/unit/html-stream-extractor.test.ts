import { describe, it, expect, vi } from 'vitest';
import { HtmlStreamExtractor, isRenderable } from '@/lib/claude/html-stream-extractor';

describe('isRenderable', () => {
  it('treats <!doctype html> as renderable', () => {
    expect(isRenderable('<!DOCTYPE html><html></html>')).toBe(true);
  });

  it('treats plain <html>/<body> as renderable', () => {
    expect(isRenderable('<html><body>hi</body></html>')).toBe(true);
  });

  it('treats balanced top-level element as renderable', () => {
    expect(isRenderable('<section><h1>Hi</h1></section>')).toBe(true);
  });

  it('treats unbalanced fragment as not renderable', () => {
    expect(isRenderable('<section><h1>Hi')).toBe(false);
  });

  it('treats empty string as not renderable', () => {
    expect(isRenderable('')).toBe(false);
  });
});

describe('HtmlStreamExtractor', () => {
  it('emits no events for text without fence', () => {
    const onStart = vi.fn();
    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const ext = new HtmlStreamExtractor({ onStart, onChunk, onComplete });
    ext.feedText('Here is some prose without code blocks.');
    expect(onStart).not.toHaveBeenCalled();
    expect(onChunk).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('emits start + chunk when an html fence opens', () => {
    const onStart = vi.fn();
    const onChunk = vi.fn();
    const ext = new HtmlStreamExtractor({ onStart, onChunk });
    ext.feedText('Preamble\n```html\n<section>');
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalled();
    const last = onChunk.mock.calls.at(-1)!;
    expect(last[0]).toContain('<section>');
    expect(last[1]).toEqual({ renderable: false });
  });

  it('progressively emits chunks as text arrives', () => {
    const onChunk = vi.fn();
    const ext = new HtmlStreamExtractor({ onChunk });
    ext.feedText('```html\n<sect');
    ext.feedText('ion>Hello');
    ext.feedText('</section>');
    expect(onChunk.mock.calls.length).toBeGreaterThanOrEqual(3);
    const last = onChunk.mock.calls.at(-1)!;
    expect(last[0]).toContain('<section>Hello</section>');
    expect(last[1]).toEqual({ renderable: true });
  });

  it('emits complete when fence closes', () => {
    const onComplete = vi.fn();
    const ext = new HtmlStreamExtractor({ onComplete });
    ext.feedText('```html\n<p>done</p>\n```');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]![0]).toContain('<p>done</p>');
  });

  it('emits renderable=true once balanced tag appears', () => {
    const onChunk = vi.fn();
    const ext = new HtmlStreamExtractor({ onChunk });
    ext.feedText('```html\n<div>');
    const firstCall = onChunk.mock.calls[0]!;
    expect(firstCall[1]).toEqual({ renderable: false });
    ext.feedText('content</div>');
    const last = onChunk.mock.calls.at(-1)!;
    expect(last[1]).toEqual({ renderable: true });
  });

  it('handles Write tool_use with .html file_path', () => {
    const onStart = vi.fn();
    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const onWritePath = vi.fn();
    const ext = new HtmlStreamExtractor({ onStart, onChunk, onComplete, onWritePath });
    ext.feedToolUse({
      name: 'Write',
      input: { file_path: '/tmp/slides.html', content: '<section>Slide</section>' },
    });
    expect(onStart).toHaveBeenCalled();
    expect(onWritePath).toHaveBeenCalledWith('/tmp/slides.html');
    expect(onChunk).toHaveBeenCalledWith('<section>Slide</section>', { renderable: true });
    expect(onComplete).toHaveBeenCalled();
  });

  it('does not emit onWritePath for inline ```html fences', () => {
    const onWritePath = vi.fn();
    const ext = new HtmlStreamExtractor({ onWritePath });
    ext.feedText('```html\n<p>done</p>\n```');
    expect(onWritePath).not.toHaveBeenCalled();
  });

  it('ignores tool_use with non-HTML file_path', () => {
    const onChunk = vi.fn();
    const ext = new HtmlStreamExtractor({ onChunk });
    ext.feedToolUse({
      name: 'Write',
      input: { file_path: '/tmp/notes.md', content: '# Hello' },
    });
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('applies Edit tool_use against the last Write baseline', () => {
    const onChunk = vi.fn();
    const ext = new HtmlStreamExtractor({ onChunk });
    const baseline =
      '<html><body><section id="p1">Page 1</section><section id="p2">Page 2</section><section id="p3">Page 3</section></body></html>';
    ext.feedToolUse({
      name: 'Write',
      input: { file_path: '/tmp/deck.html', content: baseline },
    });
    onChunk.mockClear();
    ext.feedToolUse({
      name: 'Edit',
      input: {
        file_path: '/tmp/deck.html',
        old_string: '<section id="p2">Page 2</section>',
        new_string: '<section id="p2">Page 2 (updated)</section>',
      },
    });
    expect(onChunk).toHaveBeenCalledTimes(1);
    const [html] = onChunk.mock.calls[0]!;
    expect(html).toContain('Page 1');
    expect(html).toContain('Page 2 (updated)');
    expect(html).toContain('Page 3');
    expect(html).not.toContain('>Page 2<');
  });

  it('applies MultiEdit against the baseline in order', () => {
    const onChunk = vi.fn();
    const ext = new HtmlStreamExtractor({ onChunk });
    ext.feedToolUse({
      name: 'Write',
      input: {
        file_path: 'deck.html',
        content: '<html><body><h1>A</h1><h2>B</h2></body></html>',
      },
    });
    onChunk.mockClear();
    ext.feedToolUse({
      name: 'MultiEdit',
      input: {
        file_path: 'deck.html',
        edits: [
          { old_string: '<h1>A</h1>', new_string: '<h1>Alpha</h1>' },
          { old_string: '<h2>B</h2>', new_string: '<h2>Bravo</h2>' },
        ],
      },
    });
    const [html] = onChunk.mock.calls.at(-1)!;
    expect(html).toContain('<h1>Alpha</h1>');
    expect(html).toContain('<h2>Bravo</h2>');
  });

  it('honors replace_all on Edit', () => {
    const onChunk = vi.fn();
    const ext = new HtmlStreamExtractor({ onChunk });
    ext.feedToolUse({
      name: 'Write',
      input: {
        file_path: 'deck.html',
        content: '<body><p>cat</p><p>cat</p><p>dog</p></body>',
      },
    });
    onChunk.mockClear();
    ext.feedToolUse({
      name: 'Edit',
      input: {
        file_path: 'deck.html',
        old_string: 'cat',
        new_string: 'lion',
        replace_all: true,
      },
    });
    const [html] = onChunk.mock.calls.at(-1)!;
    expect(html).toBe('<body><p>lion</p><p>lion</p><p>dog</p></body>');
  });

  it('requests baseline via onNeedBaseline when Edit arrives with no prior Write', () => {
    const onChunk = vi.fn();
    const onNeedBaseline = vi.fn<(fp: string, apply: (b: string) => void) => void>();
    const ext = new HtmlStreamExtractor({ onChunk, onNeedBaseline });
    ext.feedToolUse({
      name: 'Edit',
      input: {
        file_path: 'deck.html',
        old_string: '<h1>Old</h1>',
        new_string: '<h1>New</h1>',
      },
    });
    expect(onChunk).not.toHaveBeenCalled();
    expect(onNeedBaseline).toHaveBeenCalledTimes(1);
    const [fp, apply] = onNeedBaseline.mock.calls[0]!;
    expect(fp).toBe('deck.html');
    apply('<html><body><h1>Old</h1></body></html>');
    expect(onChunk).toHaveBeenCalledTimes(1);
    const [html] = onChunk.mock.calls[0]!;
    expect(html).toContain('<h1>New</h1>');
    expect(html).not.toContain('<h1>Old</h1>');
  });

  it('seedBaseline allows Edit to patch an externally provided document', () => {
    const onChunk = vi.fn();
    const ext = new HtmlStreamExtractor({ onChunk });
    ext.seedBaseline('<html><body><h1>Seed</h1></body></html>');
    ext.feedToolUse({
      name: 'Edit',
      input: {
        file_path: 'deck.html',
        old_string: '<h1>Seed</h1>',
        new_string: '<h1>Patched</h1>',
      },
    });
    const [html] = onChunk.mock.calls.at(-1)!;
    expect(html).toContain('<h1>Patched</h1>');
    expect(html).not.toContain('<h1>Seed</h1>');
  });

  it('updates baseline after a completed fenced block so subsequent Edits patch it', () => {
    const onChunk = vi.fn();
    const ext = new HtmlStreamExtractor({ onChunk });
    ext.feedText('```html\n<html><body><h1>X</h1></body></html>\n```');
    onChunk.mockClear();
    ext.feedToolUse({
      name: 'Edit',
      input: {
        file_path: 'page.html',
        old_string: '<h1>X</h1>',
        new_string: '<h1>Y</h1>',
      },
    });
    const [html] = onChunk.mock.calls.at(-1)!;
    expect(html).toContain('<h1>Y</h1>');
    expect(html).not.toContain('<h1>X</h1>');
  });

  it('reset clears state and emits onReset', () => {
    const onReset = vi.fn();
    const ext = new HtmlStreamExtractor({ onReset });
    ext.feedText('```html\n<p>partial');
    ext.reset();
    expect(onReset).toHaveBeenCalled();
    // After reset, feeding new text treats it as fresh
    const onStart = vi.fn();
    const ext2 = new HtmlStreamExtractor({ onStart });
    ext2.feedText('no fence here');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('finalize emits complete for open fence with content', () => {
    const onComplete = vi.fn();
    const ext = new HtmlStreamExtractor({ onComplete });
    ext.feedText('```html\n<p>unclosed');
    ext.finalize();
    expect(onComplete).toHaveBeenCalled();
    expect(onComplete.mock.calls[0]![0]).toContain('<p>unclosed');
  });
});
