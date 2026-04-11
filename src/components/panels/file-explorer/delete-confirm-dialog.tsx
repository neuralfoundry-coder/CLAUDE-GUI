'use client';

import { create } from 'zustand';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DeleteConfirmState {
  open: boolean;
  paths: string[];
  resolve: ((confirmed: boolean) => void) | null;
  request: (paths: string[]) => Promise<boolean>;
  confirm: () => void;
  cancel: () => void;
}

export const useDeleteConfirmStore = create<DeleteConfirmState>((set, get) => ({
  open: false,
  paths: [],
  resolve: null,

  request: (paths) =>
    new Promise<boolean>((resolve) => {
      const prev = get().resolve;
      // If a previous prompt is still open, reject it as cancelled.
      if (prev) prev(false);
      set({ open: true, paths, resolve });
    }),

  confirm: () => {
    const { resolve } = get();
    if (resolve) resolve(true);
    set({ open: false, resolve: null, paths: [] });
  },

  cancel: () => {
    const { resolve } = get();
    if (resolve) resolve(false);
    set({ open: false, resolve: null, paths: [] });
  },
}));

export function DeleteConfirmDialog() {
  const open = useDeleteConfirmStore((s) => s.open);
  const paths = useDeleteConfirmStore((s) => s.paths);
  const confirm = useDeleteConfirmStore((s) => s.confirm);
  const cancel = useDeleteConfirmStore((s) => s.cancel);

  const count = paths.length;
  const title =
    count === 1 ? 'Delete item' : `Delete ${count} items`;
  const description =
    count === 1
      ? `Permanently delete "${paths[0]}"? This cannot be undone.`
      : `Permanently delete ${count} selected items? This cannot be undone.`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) cancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {count > 1 && (
          <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs font-mono">
            {paths.map((p) => (
              <div key={p} className="truncate">
                {p}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={confirm}
            autoFocus
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
