'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, Trash2, Check, Eye, Code2 } from 'lucide-react';
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
import { MarkdownPreview } from '@/components/panels/preview/markdown-preview';

type ViewMode = 'preview' | 'source';

function canPreview(kind: Artifact['kind']): boolean {
  return kind === 'html' || kind === 'svg' || kind === 'markdown';
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

export function ArtifactsModal() {
  const isOpen = useArtifactStore((s) => s.isOpen);
  const artifacts = useArtifactStore((s) => s.artifacts);
  const highlightedId = useArtifactStore((s) => s.highlightedId);
  const autoOpen = useArtifactStore((s) => s.autoOpen);
  const close = useArtifactStore((s) => s.close);
  const remove = useArtifactStore((s) => s.remove);
  const clear = useArtifactStore((s) => s.clear);
  const setAutoOpen = useArtifactStore((s) => s.setAutoOpen);

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
    if (selected && !canPreview(selected.kind) && viewMode === 'preview') {
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-hidden p-0">
        <div className="flex h-[80vh] flex-col">
          <DialogHeader className="border-b px-5 py-3">
            <DialogTitle className="text-base">Generated Content</DialogTitle>
            <DialogDescription className="text-xs">
              All HTML, code, markdown, and SVG that Claude produced in this workspace.
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
            <aside className="w-64 shrink-0 overflow-y-auto border-r">
              {sorted.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No generated content yet. Ask Claude to write code, HTML, SVG, or a markdown
                  document.
                </div>
              ) : (
                <ul>
                  {sorted.map((a) => {
                    const active = a.id === selectedId;
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(a.id)}
                          className={cn(
                            'flex w-full flex-col items-start gap-1 border-b px-3 py-2 text-left text-xs transition-colors',
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
                          </div>
                          <div className="flex w-full items-center justify-between text-[10px] text-muted-foreground">
                            <span className="truncate">{a.language || 'text'}</span>
                            <span>{formatRelative(a.createdAt, now)}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
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
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {selected.language || 'text'} · {selected.content.length} chars
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {canPreview(selected.kind) && (
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
        srcDoc={artifact.content}
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
