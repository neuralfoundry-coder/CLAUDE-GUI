'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreviewStore } from '@/stores/use-preview-store';

const Document = dynamic(() => import('react-pdf').then((m) => m.Document), { ssr: false });
const Page = dynamic(() => import('react-pdf').then((m) => m.Page), { ssr: false });

// Padding between the page canvas and the scroll container edges.
const PAGE_PADDING = 16;

async function configurePdfWorker() {
  if (typeof window === 'undefined') return;
  const mod = await import('react-pdf');
  const pdfjs = mod.pdfjs;
  const version = (pdfjs as unknown as { version?: string }).version;
  if (version) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
  }
}

interface PdfPreviewProps {
  path: string;
  /**
   * Optional URL override. The artifact gallery uses this to point at
   * `/api/artifacts/raw` so captured PDFs keep loading after the user
   * switches to a different project (the main `/api/files/raw` endpoint
   * enforces the current project's sandbox).
   */
  srcOverride?: string;
}

interface PageViewportLike {
  getViewport: (options: { scale: number }) => { width: number; height: number };
}

export function PdfPreview({ path, srcOverride }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState(0);
  const [ready, setReady] = useState(false);
  const pageNumber = usePreviewStore((s) => s.pageNumber);
  const setPage = usePreviewStore((s) => s.setPage);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [nativeSize, setNativeSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    configurePdfWorker()
      .then(() => setReady(true))
      .catch(() => setReady(true));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  // Reset captured native size when the file changes so the next page
  // recomputes its fit against the new document.
  useEffect(() => {
    setNativeSize(null);
  }, [path]);

  const src = srcOverride ?? `/api/files/raw?path=${encodeURIComponent(path)}`;

  const fitWidth = (() => {
    if (!nativeSize || !containerSize.w || !containerSize.h) return undefined;
    const availW = Math.max(0, containerSize.w - PAGE_PADDING * 2);
    const availH = Math.max(0, containerSize.h - PAGE_PADDING * 2);
    if (availW === 0 || availH === 0) return undefined;
    const aspect = nativeSize.w / nativeSize.h;
    return Math.min(availW, availH * aspect);
  })();

  if (!ready) return <div className="p-4 text-xs text-muted-foreground">Loading PDF viewer…</div>;

  return (
    <div className="flex h-full flex-col bg-muted">
      <div className="flex items-center justify-center gap-2 border-b bg-background p-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setPage(Math.max(1, pageNumber - 1))}
          disabled={pageNumber <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm">
          {pageNumber} / {numPages || '?'}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setPage(Math.min(numPages, pageNumber + 1))}
          disabled={pageNumber >= numPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div
        ref={containerRef}
        className="scrollbar-thin flex flex-1 items-center justify-center overflow-auto p-4"
      >
        <Document file={src} onLoadSuccess={({ numPages: n }) => setNumPages(n)}>
          <div className="bg-white shadow-md ring-1 ring-border/70">
            <Page
              pageNumber={pageNumber}
              width={fitWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onLoadSuccess={(page: PageViewportLike) => {
                const vp = page.getViewport({ scale: 1 });
                setNativeSize((prev) =>
                  prev && prev.w === vp.width && prev.h === vp.height
                    ? prev
                    : { w: vp.width, h: vp.height },
                );
              }}
            />
          </div>
        </Document>
      </div>
    </div>
  );
}
