'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreviewStore } from '@/stores/use-preview-store';

const Document = dynamic(() => import('react-pdf').then((m) => m.Document), { ssr: false });
const Page = dynamic(() => import('react-pdf').then((m) => m.Page), { ssr: false });

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
}

export function PdfPreview({ path }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState(0);
  const [ready, setReady] = useState(false);
  const pageNumber = usePreviewStore((s) => s.pageNumber);
  const setPage = usePreviewStore((s) => s.setPage);

  useEffect(() => {
    configurePdfWorker()
      .then(() => setReady(true))
      .catch(() => setReady(true));
  }, []);

  const src = `/api/files/raw?path=${encodeURIComponent(path)}`;

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
      <div className="scrollbar-thin flex-1 overflow-auto p-4">
        <Document file={src} onLoadSuccess={({ numPages: n }) => setNumPages(n)}>
          <Page pageNumber={pageNumber} renderTextLayer={false} renderAnnotationLayer={false} />
        </Document>
      </div>
    </div>
  );
}
