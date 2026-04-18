'use client';

import { FileText, RotateCcw, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useRecoveryStore } from '@/stores/use-recovery-store';
import { useEditorStore } from '@/stores/use-editor-store';

function formatSavedAt(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return 'unknown time';
  }
}

export function RecoveryModal() {
  const open = useRecoveryStore((s) => s.modalOpen);
  const buffers = useRecoveryStore((s) => s.buffers);
  const closeModal = useRecoveryStore((s) => s.closeModal);
  const discardOne = useRecoveryStore((s) => s.discardOne);
  const discardAll = useRecoveryStore((s) => s.discardAll);

  const restoreOne = async (path: string, content: string) => {
    // Open the tab from disk (to get originalContent baseline), then apply
    // the stashed dirty content on top so the diff-against-disk is preserved.
    await useEditorStore.getState().openFile(path);
    const tab = useEditorStore.getState().tabs.find((t) => t.path === path);
    if (tab) {
      useEditorStore.getState().updateContent(tab.id, content);
    }
    discardOne(path);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) closeModal(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Recover unsaved changes?</DialogTitle>
          <DialogDescription>
            ClaudeGUI detected {buffers.length} buffer{buffers.length === 1 ? '' : 's'} with
            unsaved changes from your previous session. Restore them into the editor, or
            discard to start fresh.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-60 divide-y overflow-y-auto rounded-md border">
          {buffers.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              No buffers to recover.
            </li>
          )}
          {buffers.map((b) => (
            <li key={b.path} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <FileText className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate" title={b.path}>{b.path}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Saved {formatSavedAt(b.savedAt)} · {b.content.length} chars
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void restoreOne(b.path, b.content)}
                  aria-label={`Restore ${b.path}`}
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => discardOne(b.path)}
                  aria-label={`Discard ${b.path}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={discardAll}>
            Discard all
          </Button>
          <Button onClick={closeModal}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
