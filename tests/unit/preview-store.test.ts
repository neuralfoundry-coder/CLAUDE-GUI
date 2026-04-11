import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectPreviewType,
  isSourceToggleable,
  usePreviewStore,
} from '@/stores/use-preview-store';

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

describe('isSourceToggleable', () => {
  it('allows toggling for text-formatted types', () => {
    expect(isSourceToggleable('html')).toBe(true);
    expect(isSourceToggleable('markdown')).toBe(true);
    expect(isSourceToggleable('slides')).toBe(true);
  });

  it('disallows toggling for binary and render-only types', () => {
    expect(isSourceToggleable('pdf')).toBe(false);
    expect(isSourceToggleable('image')).toBe(false);
    expect(isSourceToggleable('docx')).toBe(false);
    expect(isSourceToggleable('xlsx')).toBe(false);
    expect(isSourceToggleable('pptx')).toBe(false);
    expect(isSourceToggleable('none')).toBe(false);
  });
});

describe('usePreviewStore viewMode', () => {
  beforeEach(() => {
    usePreviewStore.setState({
      currentFile: null,
      pageNumber: 1,
      zoom: 1,
      fullscreen: false,
      viewMode: 'rendered',
    });
  });

  it('defaults to rendered', () => {
    expect(usePreviewStore.getState().viewMode).toBe('rendered');
  });

  it('setViewMode changes the mode', () => {
    usePreviewStore.getState().setViewMode('source');
    expect(usePreviewStore.getState().viewMode).toBe('source');
  });

  it('toggleViewMode flips the mode and restores after two calls', () => {
    const { toggleViewMode } = usePreviewStore.getState();
    toggleViewMode();
    expect(usePreviewStore.getState().viewMode).toBe('source');
    usePreviewStore.getState().toggleViewMode();
    expect(usePreviewStore.getState().viewMode).toBe('rendered');
  });

  it('setFile resets viewMode to rendered', () => {
    usePreviewStore.getState().setViewMode('source');
    usePreviewStore.getState().setFile('/tmp/x.md');
    expect(usePreviewStore.getState().viewMode).toBe('rendered');
    expect(usePreviewStore.getState().currentFile).toBe('/tmp/x.md');
  });
});
