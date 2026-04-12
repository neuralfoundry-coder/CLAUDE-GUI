'use client';

import { useCallback, useRef, useState } from 'react';
import { collectFilesFromDataTransfer, hasFilePayload } from '@/lib/fs/collect-files';
import { filesApi } from '@/lib/api-client';

export interface PendingFile {
  id: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  writtenPath?: string;
  error?: string;
}

interface UseChatDropOptions {
  insertReferences: (paths: string[]) => void;
}

let fileCounter = 0;
function nextFileId(): string {
  return `drop-${Date.now()}-${fileCounter++}`;
}

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif',
]);

export function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

export function useChatDrop({ insertReferences }: UseChatDropOptions) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const dragDepthRef = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const uploadAndInsert = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const entries: PendingFile[] = files.map((f) => ({
        id: nextFileId(),
        name: f.name,
        status: 'uploading' as const,
      }));

      setPendingFiles((prev) => [...prev, ...entries]);
      setUploading(true);

      try {
        // Ensure uploads/ directory exists
        await filesApi.mkdir('uploads');
        const result = await filesApi.upload('uploads', files);

        const paths: string[] = [];
        setPendingFiles((prev) =>
          prev.map((pf) => {
            const match = result.uploaded.find(
              (u) => u.name === pf.name && pf.status === 'uploading',
            );
            if (match) {
              paths.push(match.writtenPath);
              return { ...pf, status: 'done', writtenPath: match.writtenPath };
            }
            return pf;
          }),
        );

        if (paths.length > 0) {
          insertReferences(paths);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setPendingFiles((prev) =>
          prev.map((pf) =>
            pf.status === 'uploading'
              ? { ...pf, status: 'error', error: message }
              : pf,
          ),
        );
      } finally {
        setUploading(false);
      }
    },
    [insertReferences],
  );

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!hasFilePayload(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current += 1;
      if (dragDepthRef.current === 1) setIsDragOver(true);
    },
    [],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFilePayload(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragOver(false);

      const files = collectFilesFromDataTransfer(e.dataTransfer);
      if (files.length > 0) {
        uploadAndInsert(files);
      }
    },
    [uploadAndInsert],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt || dt.files.length === 0) return;

      // Only intercept if there are actual file items
      const files: File[] = [];
      for (let i = 0; i < dt.files.length; i++) {
        const f = dt.files.item(i);
        if (!f) continue;
        if (f.type.startsWith('image/') || f.size > 0) {
          // Generate a meaningful name for pasted images
          const ext = f.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
          const name = f.name && f.name !== 'image.png'
            ? f.name
            : `paste-${Date.now()}.${ext}`;
          files.push(new File([f], name, { type: f.type }));
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        uploadAndInsert(files);
      }
    },
    [uploadAndInsert],
  );

  const removePendingFile = useCallback((id: string) => {
    setPendingFiles((prev) => prev.filter((pf) => pf.id !== id));
  }, []);

  const clearPending = useCallback(() => {
    setPendingFiles([]);
  }, []);

  return {
    pendingFiles,
    uploading,
    isDragOver,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onPaste,
    removePendingFile,
    clearPending,
  };
}
