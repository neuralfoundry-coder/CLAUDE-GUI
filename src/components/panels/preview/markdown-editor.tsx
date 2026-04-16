'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MarkdownPreview } from './markdown-preview';

interface MarkdownEditorProps {
  content: string;
  filePath: string;
  onContentChange: (content: string) => void;
}

export function MarkdownEditor({ content, filePath, onContentChange }: MarkdownEditorProps) {
  const [code, setCode] = useState(content);
  const [previewContent, setPreviewContent] = useState(content);
  const prevFileRef = useRef(filePath);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Re-initialize code when filePath changes (not on every content prop update)
  useEffect(() => {
    if (filePath !== prevFileRef.current) {
      prevFileRef.current = filePath;
      setCode(content);
      setPreviewContent(content);
    }
  }, [filePath, content]);

  // Also sync from prop when code is empty and content arrives (initial load)
  useEffect(() => {
    if (!code && content) {
      setCode(content);
      setPreviewContent(content);
    }
  }, [content, code]);

  // Auto-save: debounce 1s after last keystroke
  useEffect(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onContentChange(code);
    }, 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [code, onContentChange]);

  // Debounced preview update: 300ms
  useEffect(() => {
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      setPreviewContent(code);
    }, 300);
    return () => clearTimeout(previewTimerRef.current);
  }, [code]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab inserts spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = code.slice(0, start) + '  ' + code.slice(end);
      setCode(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  }, [code]);

  return (
    <div className="flex h-full gap-2 overflow-hidden bg-muted p-2">
      {/* Code editor */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-sm ring-1 ring-border/70 shadow-sm">
        <div className="flex items-center border-b bg-muted px-2 py-0.5">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            Markdown
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            auto-save
          </span>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className="scrollbar-thin flex-1 resize-none bg-background p-2 font-mono text-xs leading-relaxed outline-none"
        />
      </div>

      {/* Live preview */}
      <div className="flex w-2/5 flex-col overflow-hidden rounded-sm ring-1 ring-border/70 shadow-sm">
        <div className="flex items-center border-b bg-muted px-2 py-0.5">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            Preview
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <MarkdownPreview content={previewContent} />
        </div>
      </div>
    </div>
  );
}
