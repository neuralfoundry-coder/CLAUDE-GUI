'use client';

import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/stores/use-editor-store';

export function DiffAcceptBar() {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === activeTabId));
  const acceptDiff = useEditorStore((s) => s.acceptDiff);
  const rejectDiff = useEditorStore((s) => s.rejectDiff);

  if (!tab || !tab.diff) return null;

  return (
    <div className="flex h-10 items-center justify-between border-b bg-secondary px-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Claude proposed changes to {tab.path}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => rejectDiff(tab.id)}>
          <X className="mr-1 h-4 w-4" />
          Reject
        </Button>
        <Button size="sm" onClick={() => acceptDiff(tab.id)}>
          <Check className="mr-1 h-4 w-4" />
          Accept
        </Button>
      </div>
    </div>
  );
}
