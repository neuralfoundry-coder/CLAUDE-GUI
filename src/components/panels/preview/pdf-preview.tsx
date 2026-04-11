'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreviewStore } from '@/stores/use-preview-store';

const Document = dynamic(() => import('react-pdf').then((m) => m.Document), { ssr: false });
const Page = dynamic(() => import('react-pdf').then((m) => m.Page), { ssr: false });

interface PdfPreviewProps {
  path: string;
}

export function PdfPreview({ path }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState(0);
  const pageNumber = usePreviewStore((s) => s.pageNumber);
  const setPage = usePreviewStore((s) => s.setPage);

  const src = `/api/files/read?path=${encodeURIComponent(path)}`;

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
          {pageNumber} / {numPages}
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
          <Page pageNumber={pageNumber} />
        </Document>
      </div>
    </div>
  );
}
