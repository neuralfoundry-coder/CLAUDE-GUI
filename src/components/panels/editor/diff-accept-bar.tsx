'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/stores/use-editor-store';

export function DiffAcceptBar() {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === activeTabId));
  const acceptAllHunks = useEditorStore((s) => s.acceptAllHunks);
  const applyAcceptedHunks = useEditorStore((s) => s.applyAcceptedHunks);
  const rejectDiff = useEditorStore((s) => s.rejectDiff);
  const toggleHunk = useEditorStore((s) => s.toggleHunk);
  const [expanded, setExpanded] = useState(false);

  if (!tab || !tab.diff) return null;

  const { hunks, acceptedHunkIds } = tab.diff;
  const acceptedSet = new Set(acceptedHunkIds);
  const acceptedCount = acceptedHunkIds.length;
  const totalCount = hunks.length;

  return (
    <div className="border-b bg-secondary">
      <div className="flex h-10 items-center justify-between px-3 text-sm">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse hunks' : 'Expand hunks'}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            )}
          </Button>
          <span className="font-semibold">Claude proposed {totalCount} hunk(s)</span>
          <span className="text-xs text-muted-foreground">
            {acceptedCount}/{totalCount} accepted
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => rejectDiff(tab.id)}>
            <X className="mr-1 h-4 w-4" aria-hidden="true" />
            Reject all
          </Button>
          <Button size="sm" variant="outline" onClick={() => acceptAllHunks(tab.id)}>
            Select all
          </Button>
          <Button size="sm" onClick={() => applyAcceptedHunks(tab.id)}>
            <Check className="mr-1 h-4 w-4" aria-hidden="true" />
            Apply {acceptedCount} hunk(s)
          </Button>
        </div>
      </div>

      {expanded && (
        <ul className="max-h-48 overflow-y-auto border-t">
          {hunks.map((h, i) => {
            const isAccepted = acceptedSet.has(h.id);
            const label = `Hunk ${i + 1}: lines ${h.originalStart + 1}-${h.originalEnd} → ${
              h.modifiedStart + 1
            }-${h.modifiedEnd}`;
            return (
              <li key={h.id} className="flex items-start gap-2 border-b px-3 py-1 text-xs last:border-b-0">
                <input
                  type="checkbox"
                  checked={isAccepted}
                  onChange={() => toggleHunk(tab.id, h.id)}
                  aria-label={`Toggle ${label}`}
                  className="mt-0.5"
                />
                <div className="flex-1 overflow-hidden">
                  <div className="font-mono">{label}</div>
                  <div className="max-h-10 overflow-hidden whitespace-pre-wrap text-[10px] text-destructive">
                    {h.originalLines.slice(0, 2).map((l, j) => (
                      <div key={`o-${j}`}>- {l}</div>
                    ))}
                  </div>
                  <div className="max-h-10 overflow-hidden whitespace-pre-wrap text-[10px] text-green-500">
                    {h.modifiedLines.slice(0, 2).map((l, j) => (
                      <div key={`m-${j}`}>+ {l}</div>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
