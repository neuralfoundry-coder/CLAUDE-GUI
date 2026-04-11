import { describe, it, expect } from 'vitest';
import { detectPreviewType } from '@/stores/use-preview-store';

describe('detectPreviewType', () => {
  it('detects markdown', () => {
    expect(detectPreviewType('README.md')).toBe('markdown');
    expect(detectPreviewType('docs/notes.markdown')).toBe('markdown');
  });

  it('detects PDF', () => {
    expect(detectPreviewType('report.pdf')).toBe('pdf');
  });

  it('detects images', () => {
    expect(detectPreviewType('a.png')).toBe('image');
    expect(detectPreviewType('photo.JPG')).toBe('image');
    expect(detectPreviewType('icon.svg')).toBe('image');
  });

  it('detects HTML as html by default', () => {
    expect(detectPreviewType('page.html')).toBe('html');
  });

  it('detects reveal.html as slides', () => {
    expect(detectPreviewType('slides/intro.reveal.html')).toBe('slides');
  });

  it('returns none for unsupported types', () => {
    expect(detectPreviewType('x.bin')).toBe('none');
    expect(detectPreviewType(null)).toBe('none');
  });
});
