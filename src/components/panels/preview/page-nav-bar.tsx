'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLivePreviewStore, type LivePage } from '@/stores/use-live-preview-store';
import { cn } from '@/lib/utils';

const KIND_LABELS: Record<string, string> = {
  html: 'HTML',
  svg: 'SVG',
  markdown: 'MD',
  code: 'Code',
  text: 'Text',
};

function PageTab({ page, index, isActive }: { page: LivePage; index: number; isActive: boolean }) {
  const setActivePageIndex = useLivePreviewStore((s) => s.setActivePageIndex);

  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors',
        isActive
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={() => setActivePageIndex(index)}
      title={page.title}
    >
      <span className="font-mono font-semibold">{KIND_LABELS[page.kind] ?? page.kind}</span>
      <span className="max-w-20 truncate">{page.title}</span>
      {!page.complete && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
      )}
    </button>
  );
}

export function PageNavBar() {
  const pages = useLivePreviewStore((s) => s.pages);
  const activePageIndex = useLivePreviewStore((s) => s.activePageIndex);
  const setActivePageIndex = useLivePreviewStore((s) => s.setActivePageIndex);

  if (pages.length <= 1) return null;

  const canPrev = activePageIndex > 0;
  const canNext = activePageIndex < pages.length - 1;

  return (
    <div className="flex items-center gap-1 border-b bg-muted/50 px-2 py-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-4 w-4"
        disabled={!canPrev}
        onClick={() => setActivePageIndex(activePageIndex - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-3 w-3" />
      </Button>

      <div className="scrollbar-thin flex flex-1 items-center gap-0.5 overflow-x-auto">
        {pages.map((page, i) => (
          <PageTab key={page.id} page={page} index={i} isActive={i === activePageIndex} />
        ))}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-4 w-4"
        disabled={!canNext}
        onClick={() => setActivePageIndex(activePageIndex + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="h-3 w-3" />
      </Button>

      <span className="text-[9px] text-muted-foreground">
        {activePageIndex + 1}/{pages.length}
      </span>
    </div>
  );
}
