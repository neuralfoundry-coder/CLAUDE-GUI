'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Copy, Download, Trash2, Check, Eye, Code2, Search, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useArtifactStore, type Artifact } from '@/stores/use-artifact-store';
import {
  availableExports,
  copyArtifact,
  exportArtifact,
  type ExportFormat,
} from '@/lib/claude/artifact-export';
import { wrapSrcdoc } from '@/lib/preview/srcdoc-shim';
import { MarkdownPreview } from '@/components/panels/preview/markdown-preview';
import { PdfPreview } from '@/components/panels/preview/pdf-preview';
import { DocxPreview } from '@/components/panels/preview/docx-preview';
import { XlsxPreview } from '@/components/panels/preview/xlsx-preview';
import { PptxPreview } from '@/components/panels/preview/pptx-preview';
import { artifactRawUrl } from '@/lib/claude/artifact-url';

type ViewMode = 'preview' | 'source';

function canPreview(artifact: Artifact): boolean {
  const { kind, source, filePath } = artifact;
  if (kind === 'html' || kind === 'svg' || kind === 'markdown') return true;
  if (kind === 'image') return source === 'inline' || !!filePath;
  // File-backed binary kinds require a reachable filePath for the viewer to
  // fetch bytes through /api/files/raw.
  if (kind === 'pdf' || kind === 'docx' || kind === 'xlsx' || kind === 'pptx') return !!filePath;
  return false;
}

function kindLabel(kind: Artifact['kind']): string {
  switch (kind) {
    case 'html':
      return 'HTML';
    case 'svg':
      return 'SVG';
    case 'markdown':
      return 'Markdown';
    case 'code':
      return 'Code';
    case 'text':
      return 'Text';
    case 'image':
      return 'Image';
    case 'pdf':
      return 'PDF';
    case 'docx':
      return 'DOCX';
    case 'xlsx':
      return 'XLSX';
    case 'pptx':
      return 'PPTX';
  }
}

function kindBadgeClass(kind: Artifact['kind']): string {
  switch (kind) {
    case 'html':
      return 'bg-orange-500/20 text-orange-400';
    case 'svg':
      return 'bg-purple-500/20 text-purple-400';
    case 'markdown':
      return 'bg-blue-500/20 text-blue-400';
    case 'code':
      return 'bg-emerald-500/20 text-emerald-400';
    case 'image':
      return 'bg-pink-500/20 text-pink-400';
    case 'pdf':
      return 'bg-red-500/20 text-red-400';
    case 'docx':
      return 'bg-sky-500/20 text-sky-400';
    case 'xlsx':
      return 'bg-green-500/20 text-green-400';
    case 'pptx':
      return 'bg-amber-500/20 text-amber-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function formatRelative(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const MIN_MODAL_WIDTH = 640;
const MIN_MODAL_HEIGHT = 480;
const VIEWPORT_PADDING = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function clampSize(
  size: { width: number; height: number },
  viewportW: number,
  viewportH: number,
): { width: number; height: number } {
  return {
    width: clamp(size.width, MIN_MODAL_WIDTH, Math.max(MIN_MODAL_WIDTH, viewportW - VIEWPORT_PADDING)),
    height: clamp(size.height, MIN_MODAL_HEIGHT, Math.max(MIN_MODAL_HEIGHT, viewportH - VIEWPORT_PADDING)),
  };
}

export function ArtifactsModal() {
  const isOpen = useArtifactStore((s) => s.isOpen);
  const artifacts = useArtifactStore((s) => s.artifacts);
  const highlightedId = useArtifactStore((s) => s.highlightedId);
  const autoOpen = useArtifactStore((s) => s.autoOpen);
  const modalSize = useArtifactStore((s) => s.modalSize);
  const close = useArtifactStore((s) => s.close);
  const remove = useArtifactStore((s) => s.remove);
  const clear = useArtifactStore((s) => s.clear);
  const setAutoOpen = useArtifactStore((s) => s.setAutoOpen);
  const setModalSize = useArtifactStore((s) => s.setModalSize);

  const sorted = useMemo(
    () => [...artifacts].sort((a, b) => b.createdAt - a.createdAt),
    [artifacts],
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    highlightedId ?? sorted[0]?.id ?? null,
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [now, setNow] = useState(() => Date.now());
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    let list = sorted;
    if (kindFilter) {
      list = list.filter((a) => a.kind === kindFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.language.toLowerCase().includes(q) ||
          (a.filePath && a.filePath.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [sorted, searchQuery, kindFilter]);

  const availableKinds = useMemo(() => {
    const kinds = new Set(sorted.map((a) => a.kind));
    return Array.from(kinds).sort();
  }, [sorted]);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [isOpen]);

  useEffect(() => {
    if (highlightedId) setSelectedId(highlightedId);
  }, [highlightedId]);

  useEffect(() => {
    const first = sorted[0];
    if (selectedId && !sorted.find((a) => a.id === selectedId)) {
      setSelectedId(first?.id ?? null);
    } else if (!selectedId && first) {
      setSelectedId(first.id);
    }
  }, [sorted, selectedId]);

  const selected = sorted.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    if (selected && !canPreview(selected) && viewMode === 'preview') {
      setViewMode('source');
    }
  }, [selected, viewMode]);

  const onCopy = async (artifact: Artifact) => {
    try {
      await copyArtifact(artifact);
      setCopiedId(artifact.id);
      setTimeout(() => {
        setCopiedId((curr) => (curr === artifact.id ? null : curr));
      }, 1500);
    } catch (err) {
      console.error('[artifacts] copy failed', err);
    }
  };

  const onExport = (artifact: Artifact, format: ExportFormat) => {
    exportArtifact(artifact, format);
  };

  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const resizeStateRef = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    frame: number | null;
    pending: { width: number; height: number } | null;
  } | null>(null);

  // Clamp a persisted size down when the viewport becomes smaller than it.
  useEffect(() => {
    if (!isOpen || !modalSize) return;
    const handler = () => {
      const clamped = clampSize(modalSize, window.innerWidth, window.innerHeight);
      if (clamped.width !== modalSize.width || clamped.height !== modalSize.height) {
        setModalSize(clamped);
      }
    };
    handler();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [isOpen, modalSize, setModalSize]);

  const handleResizePointerMove = useCallback(
    (e: PointerEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      // Radix centers the dialog with translate(-50%, -50%), so the box grows
      // symmetrically around its center — doubling the delta makes the handle
      // track the cursor 1:1.
      const dx = (e.clientX - state.startX) * 2;
      const dy = (e.clientY - state.startY) * 2;
      const next = clampSize(
        { width: state.startW + dx, height: state.startH + dy },
        window.innerWidth,
        window.innerHeight,
      );
      state.pending = next;
      if (state.frame !== null) return;
      state.frame = window.requestAnimationFrame(() => {
        const s = resizeStateRef.current;
        if (!s) return;
        s.frame = null;
        if (s.pending) setModalSize(s.pending);
      });
    },
    [setModalSize],
  );

  const handleResizePointerUp = useCallback(
    (e: PointerEvent) => {
      const state = resizeStateRef.current;
      if (state?.frame !== null && state?.frame !== undefined) {
        window.cancelAnimationFrame(state.frame);
      }
      resizeStateRef.current = null;
      window.removeEventListener('pointermove', handleResizePointerMove);
      window.removeEventListener('pointerup', handleResizePointerUp);
      window.removeEventListener('pointercancel', handleResizePointerUp);
      document.body.style.userSelect = '';
      const target = e.target as Element | null;
      if (target && 'releasePointerCapture' in target) {
        try {
          (target as Element & {
            releasePointerCapture: (id: number) => void;
          }).releasePointerCapture(e.pointerId);
        } catch {
          /* no-op */
        }
      }
    },
    [handleResizePointerMove],
  );

  const handleResizeStart = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const content = dialogContentRef.current;
      if (!content) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = content.getBoundingClientRect();
      resizeStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: rect.width,
        startH: rect.height,
        frame: null,
        pending: null,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', handleResizePointerMove);
      window.addEventListener('pointerup', handleResizePointerUp);
      window.addEventListener('pointercancel', handleResizePointerUp);
    },
    [handleResizePointerMove, handleResizePointerUp],
  );

  useEffect(() => {
    // Defensive cleanup if the modal unmounts mid-drag.
    return () => {
      window.removeEventListener('pointermove', handleResizePointerMove);
      window.removeEventListener('pointerup', handleResizePointerUp);
      window.removeEventListener('pointercancel', handleResizePointerUp);
      document.body.style.userSelect = '';
    };
  }, [handleResizePointerMove, handleResizePointerUp]);

  const contentStyle: React.CSSProperties = {
    width: modalSize?.width ?? 'min(1024px, 90vw)',
    height: modalSize?.height ?? 'min(720px, 80vh)',
    maxWidth: 'calc(100vw - 20px)',
    maxHeight: 'calc(100vh - 20px)',
  };

  const onRowKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setSelectedId(id);
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      setSelectedId(id);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent
        ref={dialogContentRef}
        className="overflow-hidden p-0"
        style={contentStyle}
      >
        <div className="flex h-full flex-col">
          <DialogHeader className="border-b px-5 py-3">
            <DialogTitle className="text-base">Generated Content</DialogTitle>
            <DialogDescription className="text-xs">
              Every HTML, SVG, Markdown, code, image, PDF, Word, Excel, and PowerPoint document
              Claude has produced this session — kept regardless of which project you switch to.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 text-xs">
            <div className="text-muted-foreground">
              {sorted.length} artifact{sorted.length === 1 ? '' : 's'}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={autoOpen}
                  onChange={(e) => setAutoOpen(e.target.checked)}
                  className="h-3 w-3"
                />
                Auto-open on new content
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  if (confirm('Clear all saved artifacts?')) clear();
                }}
                disabled={sorted.length === 0}
              >
                Clear all
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            <aside className="flex w-64 shrink-0 flex-col border-r">
              {/* Search & filter bar */}
              {sorted.length > 0 && (
                <div className="border-b px-2 py-1.5">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search artifacts..."
                      className="h-6 w-full rounded border bg-background pl-7 pr-6 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {availableKinds.length > 1 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setKindFilter(null)}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors',
                          kindFilter === null
                            ? 'bg-primary/20 text-primary'
                            : 'text-muted-foreground hover:bg-muted',
                        )}
                      >
                        All
                      </button>
                      {availableKinds.map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setKindFilter(kindFilter === k ? null : k)}
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[9px] font-medium uppercase transition-colors',
                            kindFilter === k
                              ? kindBadgeClass(k as Artifact['kind'])
                              : 'text-muted-foreground hover:bg-muted',
                          )}
                        >
                          {kindLabel(k as Artifact['kind'])}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex-1 overflow-y-auto">
              {sorted.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No generated content yet. Ask Claude to write code, HTML, SVG, Markdown, Word,
                  Excel, or PowerPoint documents — every Write/Edit gets captured here.
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No artifacts match your search.
                </div>
              ) : (
                <ul>
                  {filtered.map((a) => {
                    const active = a.id === selectedId;
                    return (
                      <li key={a.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-pressed={active}
                          onClick={() => setSelectedId(a.id)}
                          onKeyDown={(e) => onRowKeyDown(e, a.id)}
                          className={cn(
                            'group flex w-full cursor-pointer flex-col items-start gap-1 border-b px-3 py-2 text-left text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            active ? 'bg-accent' : 'hover:bg-muted',
                          )}
                        >
                          <div className="flex w-full items-center gap-1.5">
                            <span
                              className={cn(
                                'shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase',
                                kindBadgeClass(a.kind),
                              )}
                            >
                              {kindLabel(a.kind)}
                            </span>
                            <span className="flex-1 truncate font-medium">{a.title}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                remove(a.id);
                              }}
                              onKeyDown={(e) => e.stopPropagation()}
                              aria-label={`Delete ${a.title}`}
                              title="Delete artifact"
                              className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-destructive group-hover:opacity-100"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </div>
                          <div className="flex w-full items-center justify-between text-[10px] text-muted-foreground">
                            <span className="truncate">{a.language || 'text'}</span>
                            <span>{formatRelative(a.createdAt, now)}</span>
                          </div>
                          {a.filePath && (
                            <div className="w-full truncate font-mono text-[9px] text-muted-foreground/60" title={a.filePath}>
                              {a.filePath.split('/').slice(-2).join('/')}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col">
              {selected ? (
                <>
                  <div className="flex items-center justify-between border-b px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 font-mono text-[9px] uppercase',
                            kindBadgeClass(selected.kind),
                          )}
                        >
                          {kindLabel(selected.kind)}
                        </span>
                        <h3 className="truncate text-sm font-semibold">{selected.title}</h3>
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {selected.language || 'text'}
                        {selected.source === 'file'
                          ? ` · ${selected.filePath ?? 'on disk'}`
                          : ` · ${selected.content.length} chars`}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {canPreview(selected) && (
                        <div className="mr-1 flex items-center rounded-md border">
                          <button
                            type="button"
                            onClick={() => setViewMode('preview')}
                            className={cn(
                              'flex h-7 items-center gap-1 px-2 text-[11px]',
                              viewMode === 'preview'
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:bg-muted',
                            )}
                            aria-pressed={viewMode === 'preview'}
                            aria-label="Rendered preview"
                          >
                            <Eye className="h-3 w-3" aria-hidden="true" />
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewMode('source')}
                            className={cn(
                              'flex h-7 items-center gap-1 border-l px-2 text-[11px]',
                              viewMode === 'source'
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:bg-muted',
                            )}
                            aria-pressed={viewMode === 'source'}
                            aria-label="Source view"
                          >
                            <Code2 className="h-3 w-3" aria-hidden="true" />
                            Source
                          </button>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => void onCopy(selected)}
                      >
                        {copiedId === selected.id ? (
                          <>
                            <Check className="h-3 w-3" aria-hidden="true" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" aria-hidden="true" />
                            Copy
                          </>
                        )}
                      </Button>
                      <ExportMenu
                        artifact={selected}
                        onExport={(fmt) => onExport(selected, fmt)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => remove(selected.id)}
                        title="Delete artifact"
                        aria-label="Delete artifact"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <div className="scrollbar-thin flex-1 overflow-auto bg-muted/20">
                    <ArtifactPreview artifact={selected} mode={viewMode} />
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                  Select an artifact to preview it.
                </div>
              )}
            </section>
          </div>
        </div>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize Generated Content"
          onPointerDown={handleResizeStart}
          className="absolute bottom-0 right-0 z-10 flex h-4 w-4 cursor-se-resize items-end justify-end text-muted-foreground/60 hover:text-muted-foreground"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M11 6 L6 11 M11 9 L9 11"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ArtifactPreviewProps {
  artifact: Artifact;
  mode: ViewMode;
}

function ArtifactPreview({ artifact, mode }: ArtifactPreviewProps) {
  if (mode === 'source') {
    return (
      <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed">
        {artifact.content}
      </pre>
    );
  }

  if (artifact.kind === 'html') {
    return (
      <iframe
        key={artifact.id}
        title={artifact.title}
        sandbox="allow-scripts"
        srcDoc={wrapSrcdoc(artifact.content)}
        className="h-full min-h-[400px] w-full bg-white"
      />
    );
  }

  if (artifact.kind === 'svg') {
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artifact.content)}`;
    return (
      <div className="flex h-full items-center justify-center bg-white p-6">
        {/* SVG in <img> runs in a script-stripped context, so <script> and event handlers are neutralised. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUri}
          alt={artifact.title}
          className="max-h-full max-w-full"
        />
      </div>
    );
  }

  if (artifact.kind === 'markdown') {
    return <MarkdownPreview content={artifact.content} />;
  }

  if (artifact.kind === 'image') {
    // Prefer the session-scoped artifact registry so images captured in a
    // previous project still render after the user switches directories.
    // Inline SVG text captured via a fenced block falls back to data URI.
    if (artifact.filePath) {
      const src = artifactRawUrl(artifact.filePath);
      return (
        <div className="flex h-full items-center justify-center bg-white p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={artifact.title} className="max-h-full max-w-full object-contain" />
        </div>
      );
    }
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artifact.content)}`;
    return (
      <div className="flex h-full items-center justify-center bg-white p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri} alt={artifact.title} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }

  if (artifact.kind === 'pdf' && artifact.filePath) {
    return <PdfPreview path={artifact.filePath} srcOverride={artifactRawUrl(artifact.filePath)} />;
  }
  if (artifact.kind === 'docx' && artifact.filePath) {
    return <DocxPreview path={artifact.filePath} />;
  }
  if (artifact.kind === 'xlsx' && artifact.filePath) {
    return <XlsxPreview path={artifact.filePath} />;
  }
  if (artifact.kind === 'pptx' && artifact.filePath) {
    return <PptxPreview path={artifact.filePath} />;
  }

  if (artifact.source === 'file' && artifact.filePath) {
    // Binary artifact captured from a project we are no longer in — show the
    // metadata card with an Export affordance the user can still trigger.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
        <div className="font-medium text-foreground">{artifact.title}</div>
        <div>{artifact.filePath}</div>
        <div>Preview requires the source project to be active. Use Export to download the file.</div>
      </div>
    );
  }

  return (
    <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed">
      {artifact.content}
    </pre>
  );
}

interface ExportMenuProps {
  artifact: Artifact;
  onExport: (format: ExportFormat) => void;
}

function ExportMenu({ artifact, onExport }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => availableExports(artifact), [artifact]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-artifact-export-menu]')) setOpen(false);
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [open]);

  return (
    <div className="relative" data-artifact-export-menu>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download className="h-3 w-3" aria-hidden="true" />
        Export
      </Button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 min-w-[180px] rounded-md border bg-popover p-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.format}
              type="button"
              className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
              onClick={() => {
                setOpen(false);
                onExport(opt.format);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
