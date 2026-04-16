'use client';

import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, History, AlertTriangle, ChevronUp, Folder } from 'lucide-react';
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
import { projectApi } from '@/lib/api-client';

interface ProjectPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BrowseState {
  parent: string | null;
  current: string;
  dirs: string[];
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
  const [browse, setBrowse] = useState<BrowseState | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);

  const loadBrowse = useCallback(async (dirPath?: string) => {
    setBrowseLoading(true);
    try {
      const result = await projectApi.browse(dirPath);
      setBrowse(result);
    } catch {
      // If browsing fails, just clear the browse state
      setBrowse(null);
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      // Load home directory listing when modal opens
      loadBrowse();
    } else {
      setError(null);
      setConfirmDirty(null);
      setPathInput('');
      setBrowse(null);
    }
  }, [open, loadBrowse]);

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

  const dirName = (fullPath: string) => {
    const parts = fullPath.split('/');
    return parts[parts.length - 1] || fullPath;
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
            Select a project directory. The file explorer, terminal, and Claude
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
            <div className="flex gap-2">
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
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
              <Button onClick={() => handleOpen(pathInput)} disabled={loading} size="sm">
                {loading ? 'Opening...' : 'Open'}
              </Button>
            </div>
          </div>

          {/* Directory browser */}
          {browse && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Folder className="h-3 w-3" aria-hidden="true" />
                Browse directories
              </div>
              <div className="rounded-md border bg-muted/50 px-2 py-1.5 text-xs font-mono text-muted-foreground truncate">
                {browse.current}
              </div>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                {browse.parent && (
                  <li>
                    <button
                      type="button"
                      onClick={() => loadBrowse(browse.parent!)}
                      disabled={browseLoading}
                      className="flex w-full items-center gap-2 rounded-md border border-transparent px-3 py-1.5 text-left text-xs font-mono hover:border-border hover:bg-muted"
                    >
                      <ChevronUp className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      ..
                    </button>
                  </li>
                )}
                {browse.dirs.map((dir) => (
                  <li key={dir} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => loadBrowse(dir)}
                      disabled={browseLoading}
                      className="flex-1 flex items-center gap-2 rounded-md border border-transparent px-3 py-1.5 text-left text-xs font-mono hover:border-border hover:bg-muted truncate"
                      title={dir}
                    >
                      <Folder className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      {dirName(dir)}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs shrink-0"
                      onClick={() => handleOpen(dir)}
                      disabled={loading}
                    >
                      Open
                    </Button>
                  </li>
                ))}
                {browse.dirs.length === 0 && (
                  <li className="px-3 py-2 text-xs text-muted-foreground italic">
                    No subdirectories
                  </li>
                )}
              </ul>
              {/* Open the currently browsed directory itself */}
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => handleOpen(browse.current)}
                disabled={loading}
              >
                Open this directory: {dirName(browse.current)}
              </Button>
            </div>
          )}

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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
