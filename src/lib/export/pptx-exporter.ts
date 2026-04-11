'use client';

export interface SlideData {
  title?: string;
  body?: string;
  notes?: string;
}

export async function exportToPptx(slides: SlideData[], filename = 'presentation.pptx'): Promise<void> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';

  for (const s of slides) {
    const slide = pptx.addSlide();
    if (s.title) {
      slide.addText(s.title, { x: 0.5, y: 0.3, w: 9, h: 1, fontSize: 28, bold: true });
    }
    if (s.body) {
      slide.addText(s.body, { x: 0.5, y: 1.3, w: 9, h: 4, fontSize: 16 });
    }
    if (s.notes) {
      slide.addNotes(s.notes);
    }
  }

  await pptx.writeFile({ fileName: filename });
}

export function parseHtmlToSlides(html: string): SlideData[] {
  if (typeof DOMParser === 'undefined') return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const sections = Array.from(doc.querySelectorAll('section'));
  return sections.map((section) => {
    const h1 = section.querySelector('h1, h2, h3');
    const title = h1?.textContent?.trim();
    const body = Array.from(section.querySelectorAll('p, li'))
      .map((el) => el.textContent?.trim())
      .filter(Boolean)
      .join('\n');
    return { title, body };
  });
}
