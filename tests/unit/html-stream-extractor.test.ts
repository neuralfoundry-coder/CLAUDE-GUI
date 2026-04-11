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
    const ext = new HtmlStreamExtractor({ onStart, onChunk, onComplete });
    ext.feedToolUse({
      name: 'Write',
      input: { file_path: '/tmp/slides.html', content: '<section>Slide</section>' },
    });
    expect(onStart).toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith('<section>Slide</section>', { renderable: true });
    expect(onComplete).toHaveBeenCalled();
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

  it('handles Edit tool_use with new_string', () => {
    const onChunk = vi.fn();
    const ext = new HtmlStreamExtractor({ onChunk });
    ext.feedToolUse({
      name: 'Edit',
      input: { file_path: 'index.html', new_string: '<main>updated</main>' },
    });
    expect(onChunk).toHaveBeenCalledWith('<main>updated</main>', { renderable: true });
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
