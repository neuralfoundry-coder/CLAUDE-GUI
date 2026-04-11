import { describe, it, expect } from 'vitest';
import { previewDownloadOptions } from '@/lib/preview/preview-download';

describe('previewDownloadOptions', () => {
  it('returns source + html + pdf + doc for markdown previews', () => {
    const opts = previewDownloadOptions({
      filePath: '/tmp/notes.md',
      type: 'markdown',
      content: '# hello',
    });
    const formats = opts.map((o) => o.format);
    expect(formats).toEqual(['source', 'html', 'pdf', 'doc']);
  });

  it('returns source + pdf + doc for html previews (html is the source)', () => {
    const opts = previewDownloadOptions({
      filePath: '/tmp/index.html',
      type: 'html',
      content: '<!doctype html><html></html>',
    });
    expect(opts.map((o) => o.format)).toEqual(['source', 'pdf', 'doc']);
  });

  it('treats slide previews as markdown sources', () => {
    const opts = previewDownloadOptions({
      filePath: '/tmp/deck.reveal.html',
      type: 'slides',
      content: '# slide 1',
    });
    expect(opts.map((o) => o.format)).toEqual(['source', 'html', 'pdf', 'doc']);
  });

  it('exposes svg + png + pdf for svg image previews', () => {
    const opts = previewDownloadOptions({
      filePath: '/tmp/icon.svg',
      type: 'image',
      content: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
    expect(opts.map((o) => o.format)).toEqual(['source', 'png', 'pdf']);
  });

  it('only exposes "file" for raster image previews', () => {
    const opts = previewDownloadOptions({
      filePath: '/tmp/photo.png',
      type: 'image',
      content: '',
    });
    expect(opts.map((o) => o.format)).toEqual(['file']);
  });

  it('only exposes "file" for pdf previews', () => {
    const opts = previewDownloadOptions({
      filePath: '/tmp/report.pdf',
      type: 'pdf',
      content: '',
    });
    expect(opts.map((o) => o.format)).toEqual(['file']);
  });

  it('only exposes "file" for docx/xlsx/pptx previews', () => {
    for (const [ext, type] of [
      ['docx', 'docx'],
      ['xlsx', 'xlsx'],
      ['pptx', 'pptx'],
    ] as const) {
      const opts = previewDownloadOptions({
        filePath: `/tmp/sheet.${ext}`,
        type,
        content: '',
      });
      expect(opts.map((o) => o.format)).toEqual(['file']);
    }
  });
});
