import type { PreviewType } from '@/stores/use-preview-store';

/**
 * Extract plain text from preview content for TTS playback.
 *
 * @param type      The preview type (html, markdown, slides, etc.)
 * @param content   Raw content string (HTML or Markdown source)
 * @param slideIndex  Optional 0-based slide index for slides type.
 *                    When provided, only that slide's text is returned.
 */
export function extractPreviewText(
  type: PreviewType,
  content: string,
  slideIndex?: number,
): string {
  switch (type) {
    case 'markdown':
      return content;

    case 'html':
      return htmlToText(content);

    case 'slides':
      return extractSlideText(content, slideIndex);

    default:
      return '';
  }
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent?.trim() ?? '';
}

function extractSlideText(html: string, slideIndex?: number): string {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const sections = wrapper.querySelectorAll('section');

  if (sections.length === 0) {
    // Fallback: treat whole content as single block
    return wrapper.textContent?.trim() ?? '';
  }

  if (slideIndex !== undefined && slideIndex >= 0 && slideIndex < sections.length) {
    return sections[slideIndex]!.textContent?.trim() ?? '';
  }

  // Read all slides, separated by pause markers
  return Array.from(sections)
    .map((s) => s.textContent?.trim() ?? '')
    .filter(Boolean)
    .join('. ');
}
