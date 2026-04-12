'use client';

import { X, FileImage, File as FileIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { PendingFile } from './use-chat-drop';
import { isImageFile } from './use-chat-drop';

interface AttachedFilesBarProps {
  files: PendingFile[];
  onRemove: (id: string) => void;
}

export function AttachedFilesBar({ files, onRemove }: AttachedFilesBarProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 border-t px-2 py-1.5">
      {files.map((pf) => (
        <div
          key={pf.id}
          className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-0.5 text-xs"
          aria-label={`${pf.name} — ${pf.status}`}
        >
          {isImageFile(pf.name) ? (
            <FileImage className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <FileIcon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}

          <span className="max-w-[120px] truncate" title={pf.name}>
            {pf.name}
          </span>

          {pf.status === 'uploading' && (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-label="Uploading" />
          )}
          {pf.status === 'done' && (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" aria-label="Uploaded" />
          )}
          {pf.status === 'error' && (
            <span title={pf.error}>
              <AlertCircle
                className="h-3 w-3 shrink-0 text-destructive"
                aria-label="Upload failed"
              />
            </span>
          )}

          <button
            type="button"
            onClick={() => onRemove(pf.id)}
            className="ml-0.5 rounded-sm p-0.5 hover:bg-muted-foreground/20"
            aria-label={`Remove ${pf.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
