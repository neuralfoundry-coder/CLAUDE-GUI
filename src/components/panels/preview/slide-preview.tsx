'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Save, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreviewStore } from '@/stores/use-preview-store';
import { getClaudeClient } from '@/lib/websocket/claude-client';
import { cn } from '@/lib/utils';

interface SlidePreviewProps {
  content: string;
  onContentChange?: (newContent: string) => void;
}

/** Parse HTML string into individual slide sections. */
function parseSections(html: string): string[] {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const sections = tmp.querySelectorAll('section');
  if (sections.length === 0) return [html];
  return Array.from(sections).map((s) => s.outerHTML);
}

/** Reconstruct full HTML by replacing all sections. */
function reconstructHtml(original: string, sections: string[]): string {
  // Find the portion before first <section and after last </section>
  const firstIdx = original.indexOf('<section');
  const lastIdx = original.lastIndexOf('</section>');
  if (firstIdx === -1 || lastIdx === -1) return sections.join('\n');
  const closingTagEnd = lastIdx + '</section>'.length;
  const before = original.slice(0, firstIdx);
  const after = original.slice(closingTagEnd);
  return before + sections.join('\n') + after;
}

/** Build a minimal HTML doc wrapping a single slide section for preview. */
function buildSlideDoc(sectionHtml: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/theme/black.css"/>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#222}
.reveal{height:100%}
.reveal .slides{pointer-events:none}
.reveal .slides>section{
  transform:none !important;
  position:relative !important;
  left:auto !important;top:auto !important;
  width:100% !important;height:100% !important;
  display:flex !important;flex-direction:column !important;
  justify-content:center !important;align-items:center !important;
  padding:24px !important;box-sizing:border-box !important;
}
</style>
</head><body>
<div class="reveal"><div class="slides">${sectionHtml}</div></div>
</body></html>`;
}

function SlideCard({
  sectionHtml,
  index,
  isSelected,
  onSelect,
}: {
  sectionHtml: string;
  index: number;
  isSelected: boolean;
  onSelect: (idx: number) => void;
}) {
  const doc = useMemo(() => buildSlideDoc(sectionHtml), [sectionHtml]);

  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      className={cn(
        'group relative w-full shrink-0 cursor-pointer rounded-md border-2 transition-all',
        'hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected ? 'border-primary shadow-lg shadow-primary/20' : 'border-border/50',
      )}
    >
      {/* Slide number badge */}
      <span
        className={cn(
          'absolute left-2 top-2 z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
          isSelected
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {index + 1}
      </span>

      {/* Slide preview iframe */}
      <div className="aspect-[960/700] w-full overflow-hidden rounded-[4px]">
        <iframe
          srcDoc={doc}
          sandbox=""
          referrerPolicy="no-referrer"
          title={`Slide ${index + 1}`}
          className="pointer-events-none h-full w-full border-0"
          tabIndex={-1}
        />
      </div>
    </button>
  );
}

function SlideEditor({
  sectionHtml,
  slideIndex,
  onSave,
  onCancel,
}: {
  sectionHtml: string;
  slideIndex: number;
  onSave: (newHtml: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(sectionHtml);
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCode(sectionHtml);
  }, [sectionHtml]);

  const handleSave = useCallback(() => {
    onSave(code);
  }, [code, onSave]);

  const handlePromptSubmit = useCallback(() => {
    if (!prompt.trim()) return;
    const instruction = `슬라이드 ${slideIndex + 1}번을 다음과 같이 수정해줘: ${prompt.trim()}\n\n현재 슬라이드 HTML:\n\`\`\`html\n${sectionHtml}\n\`\`\``;
    getClaudeClient().sendQuery(instruction);
    setPrompt('');
  }, [prompt, slideIndex, sectionHtml]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handlePromptSubmit();
      }
    },
    [handlePromptSubmit],
  );

  const handleCodeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave],
  );

  const previewDoc = useMemo(() => buildSlideDoc(code), [code]);

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      {/* Prompt input */}
      <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
        <input
          ref={promptRef}
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`슬라이드 ${slideIndex + 1} 수정 지시...`}
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={handlePromptSubmit}
          disabled={!prompt.trim()}
          title="Claude에게 수정 요청"
        >
          <Send className="h-3 w-3" />
        </Button>
      </div>

      {/* Split: code editor + live preview */}
      <div className="flex flex-1 gap-2 overflow-hidden">
        {/* Code editor */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-md border">
          <div className="flex items-center justify-between border-b bg-muted px-2 py-0.5">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
              HTML · Slide {slideIndex + 1}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={handleSave}
                title="저장 (Cmd+S)"
              >
                <Save className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={onCancel}
                title="편집 닫기"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleCodeKeyDown}
            spellCheck={false}
            className="scrollbar-thin flex-1 resize-none bg-background p-2 font-mono text-xs leading-relaxed outline-none"
          />
        </div>

        {/* Live preview of this slide */}
        <div className="flex w-2/5 flex-col overflow-hidden rounded-md border">
          <div className="flex items-center border-b bg-muted px-2 py-0.5">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
              Preview
            </span>
          </div>
          <div className="flex-1 overflow-hidden bg-black/80">
            <iframe
              srcDoc={previewDoc}
              sandbox=""
              referrerPolicy="no-referrer"
              title={`Slide ${slideIndex + 1} edit preview`}
              className="h-full w-full border-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SlidePreview({ content, onContentChange }: SlidePreviewProps) {
  const selectedSlideIndex = usePreviewStore((s) => s.selectedSlideIndex);
  const setSelectedSlideIndex = usePreviewStore((s) => s.setSelectedSlideIndex);
  const slideEditMode = usePreviewStore((s) => s.slideEditMode);
  const setSlideEditMode = usePreviewStore((s) => s.setSlideEditMode);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(() => parseSections(content), [content]);

  // Clamp selected index
  useEffect(() => {
    if (selectedSlideIndex >= sections.length) {
      setSelectedSlideIndex(Math.max(0, sections.length - 1));
    }
  }, [sections.length, selectedSlideIndex, setSelectedSlideIndex]);

  const handleSelect = useCallback(
    (idx: number) => {
      setSelectedSlideIndex(idx);
    },
    [setSelectedSlideIndex],
  );

  const handleSaveSlide = useCallback(
    (newHtml: string) => {
      const updated = [...sections];
      updated[selectedSlideIndex] = newHtml;
      const newContent = reconstructHtml(content, updated);
      onContentChange?.(newContent);
    },
    [sections, selectedSlideIndex, content, onContentChange],
  );

  const handleCancelEdit = useCallback(() => {
    setSlideEditMode(false);
  }, [setSlideEditMode]);

  if (slideEditMode && sections[selectedSlideIndex]) {
    return (
      <div className="h-full w-full bg-muted p-2">
        <SlideEditor
          sectionHtml={sections[selectedSlideIndex]}
          slideIndex={selectedSlideIndex}
          onSave={handleSaveSlide}
          onCancel={handleCancelEdit}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-muted">
      {/* Slide count header */}
      <div className="flex items-center justify-between border-b bg-muted px-3 py-1">
        <span className="text-[10px] text-muted-foreground">
          {sections.length} slides
          {selectedSlideIndex < sections.length && ` · Selected: ${selectedSlideIndex + 1}`}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => {
            if (sections.length > 0 && selectedSlideIndex < sections.length) {
              setSlideEditMode(true);
            }
          }}
          title="슬라이드 편집 모드"
          disabled={sections.length === 0}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </div>

      {/* Vertical scroll of slide cards */}
      <div
        ref={scrollContainerRef}
        className="scrollbar-thin flex-1 overflow-y-auto p-3"
      >
        <div className="mx-auto flex max-w-xl flex-col gap-3">
          {sections.map((sec, i) => (
            <SlideCard
              key={i}
              sectionHtml={sec}
              index={i}
              isSelected={i === selectedSlideIndex}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
