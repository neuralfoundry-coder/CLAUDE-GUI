'use client';

import { useSearchStore } from '@/stores/use-search-store';
import { SearchPanel } from '@/components/panels/search/search-panel';

export function SearchOverlay() {
  const open = useSearchStore((s) => s.open);
  if (!open) return null;

  return (
    <div className="fixed left-0 top-7 bottom-6 z-40 w-[340px] max-w-[90vw] shadow-xl border-r">
      <SearchPanel />
    </div>
  );
}
