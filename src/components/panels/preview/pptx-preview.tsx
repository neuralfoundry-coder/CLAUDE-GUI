'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fetchArtifactBytes } from '@/lib/claude/artifact-url';
import { usePreviewStore } from '@/stores/use-preview-store';

interface PptxPreviewProps {
  path: string;
}

interface SlidePage {
  title: string;
  bullets: string[];
  images: string[];
}

/**
 * Minimal `.pptx` preview. PowerPoint doesn't have a first-class WebAssembly
 * renderer, so we take the pragmatic path: JSZip the OOXML, read each slide's
 * `drawingml` text, extract the top-level text frames as "title + bullets",
 * and surface any embedded raster images as object-URL thumbnails.
 *
 * The result is an approximation — for a pixel-perfect render the user
 * should use Export → Download and open in PowerPoint/Keynote.
 */
export function PptxPreview({ path }: PptxPreviewProps) {
  const [slides, setSlides] = useState<SlidePage[]>([]);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    setLoading(true);
    setError(null);
    setSlides([]);
    setCurrent(0);

    (async () => {
      try {
        const buf = await fetchArtifactBytes(path);
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(buf);

        const slideFiles = Object.keys(zip.files)
          .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
          .sort((a, b) => {
            const ai = parseInt(a.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10);
            const bi = parseInt(b.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10);
            return ai - bi;
          });

        const parser = new DOMParser();
        const pages: SlidePage[] = [];

        for (const name of slideFiles) {
          const xml = await zip.files[name]!.async('string');
          const doc = parser.parseFromString(xml, 'application/xml');
          const textFrames: string[][] = [];
          const spNodes = doc.getElementsByTagName('p:sp');
          for (let i = 0; i < spNodes.length; i += 1) {
            const sp = spNodes.item(i);
            if (!sp) continue;
            const paragraphs = sp.getElementsByTagName('a:p');
            const frameLines: string[] = [];
            for (let j = 0; j < paragraphs.length; j += 1) {
              const p = paragraphs.item(j);
              if (!p) continue;
              const runs = p.getElementsByTagName('a:t');
              let line = '';
              for (let k = 0; k < runs.length; k += 1) {
                line += runs.item(k)?.textContent ?? '';
              }
              if (line.trim()) frameLines.push(line);
            }
            if (frameLines.length > 0) textFrames.push(frameLines);
          }

          // Images referenced by this slide (via its rels file).
          const relName = name.replace(/slides\/slide(\d+)\.xml/, 'slides/_rels/slide$1.xml.rels');
          const images: string[] = [];
          const relFile = zip.file(relName);
          if (relFile) {
            const relXml = await relFile.async('string');
            const relDoc = parser.parseFromString(relXml, 'application/xml');
            const rels = relDoc.getElementsByTagName('Relationship');
            for (let i = 0; i < rels.length; i += 1) {
              const r = rels.item(i);
              const target = r?.getAttribute('Target') ?? '';
              if (!/media\/image/i.test(target)) continue;
              const imgPath = `ppt/${target.replace(/^\.\.\//, '')}`;
              const imgFile = zip.file(imgPath);
              if (!imgFile) continue;
              const blob = await imgFile.async('blob');
              const url = URL.createObjectURL(blob);
              objectUrls.push(url);
              images.push(url);
            }
          }

          const [titleLines, ...rest] = textFrames;
          pages.push({
            title: titleLines?.join(' ') || `Slide ${pages.length + 1}`,
            bullets: rest.flat(),
            images,
          });
        }

        if (!cancelled) setSlides(pages);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render pptx');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [path]);

  // Publish rendered HTML for cross-format export (PDF via print, etc.)
  // Each slide becomes a landscape page for printing.
  const setRenderedHtml = usePreviewStore((s) => s.setRenderedHtml);
  const allSlidesHtml = useMemo(() => {
    if (slides.length === 0) return null;
    const slideBodies = slides.map((s, i) => {
      const bullets = s.bullets.length > 0
        ? `<ul style="list-style:disc;padding-left:20px;font-size:18px;color:#374151">${s.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>`
        : '';
      // Note: object-URL images won't work in print iframe, skip them for print.
      return `<div class="slide-page"${i > 0 ? ' style="page-break-before:always"' : ''}>
        <h2 style="font-size:28px;font-weight:600;color:#111;margin:0 0 16px">${s.title}</h2>
        ${bullets}
      </div>`;
    }).join('\n');
    return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4 landscape; margin: 20mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 40px; color: #111; }
    .slide-page { display: flex; flex-direction: column; justify-content: center; min-height: calc(100vh - 80px); }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .slide-page { min-height: auto; padding: 20px 0; }
    }
  </style></head><body>${slideBodies}</body></html>`;
  }, [slides]);

  useEffect(() => {
    setRenderedHtml(allSlidesHtml);
    return () => setRenderedHtml(null);
  }, [allSlidesHtml, setRenderedHtml]);

  if (loading) return <div className="p-4 text-xs text-muted-foreground">Loading PowerPoint deck…</div>;
  if (error) return <div className="p-4 text-xs text-red-500">{error}</div>;
  if (slides.length === 0) return <div className="p-4 text-xs text-muted-foreground">No slides found.</div>;

  const slide = slides[current] ?? slides[0]!;

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted">
      <div className="flex shrink-0 items-center justify-center gap-2 border-b bg-background p-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm">
          {current + 1} / {slides.length}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCurrent((c) => Math.min(slides.length - 1, c + 1))}
          disabled={current >= slides.length - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        <div
          className={cn(
            'aspect-[16/9] w-full max-w-4xl rounded-lg bg-white p-10 shadow-md ring-1 ring-border/70',
            'flex flex-col gap-4 overflow-auto',
          )}
        >
          <h2 className="text-2xl font-semibold text-gray-900">{slide.title}</h2>
          {slide.bullets.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              {slide.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
          {slide.images.length > 0 && (
            <div className="mt-auto flex flex-wrap gap-2">
              {slide.images.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt={`slide ${current + 1} image ${i + 1}`}
                  className="max-h-48 max-w-[48%] rounded border border-gray-200 object-contain"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
