'use client';

import { useEffect, useState } from 'react';
import { FolderOpen, History, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/stores/use-project-store';
import { useEditorStore } from '@/stores/use-editor-store';

interface ProjectPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectPickerModal({ open, onOpenChange }: ProjectPickerModalProps) {
  const activeRoot = useProjectStore((s) => s.activeRoot);
  const recents = useProjectStore((s) => s.recents);
  const loading = useProjectStore((s) => s.loading);
  const openProject = useProjectStore((s) => s.openProject);
  const hasDirtyTabs = useEditorStore((s) => s.hasDirtyTabs);
  const [pathInput, setPathInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDirty, setConfirmDirty] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setConfirmDirty(null);
      setPathInput('');
    }
  }, [open]);

  const handleOpen = async (target: string) => {
    if (!target.trim()) {
      setError('Path is required');
      return;
    }
    if (hasDirtyTabs() && confirmDirty !== target) {
      setConfirmDirty(target);
      return;
    }
    setError(null);
    try {
      await openProject(target);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" aria-hidden="true" />
            Open Project
          </DialogTitle>
          <DialogDescription>
            Enter an absolute path to a directory. The file explorer, terminal, and Claude
            queries will all switch to this project root.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="project-path" className="text-xs font-semibold text-muted-foreground">
              Current project
            </label>
            <div className="rounded-md border bg-muted px-3 py-2 text-sm font-mono">
              {activeRoot ?? '(none)'}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="project-path" className="text-xs font-semibold text-muted-foreground">
              Project path
            </label>
            <input
              id="project-path"
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === 'Enter') handleOpen(pathInput);
              }}
              placeholder="/absolute/path/to/project"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          </div>

          {recents.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <History className="h-3 w-3" aria-hidden="true" />
                Recent projects
              </div>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {recents.map((recent) => (
                  <li key={recent}>
                    <button
                      type="button"
                      onClick={() => handleOpen(recent)}
                      className="w-full rounded-md border border-transparent px-3 py-2 text-left text-xs font-mono hover:border-border hover:bg-muted"
                      aria-label={`Open ${recent}`}
                    >
                      {recent}
                      {recent === activeRoot && (
                        <span className="ml-2 text-muted-foreground">(current)</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {confirmDirty && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" aria-hidden="true" />
              <span>
                Unsaved changes will be discarded. Click the path again or press Enter to
                confirm switching to <strong className="font-mono">{confirmDirty}</strong>.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => handleOpen(pathInput)} disabled={loading}>
            {loading ? 'Opening...' : 'Open'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
