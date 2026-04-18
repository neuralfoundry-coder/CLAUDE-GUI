'use client';

import { useRef, useCallback } from 'react';
import { Search, X, CaseSensitive, FileSearch, Replace, Loader2, AlertTriangle } from 'lucide-react';
import { useSearchStore } from '@/stores/use-search-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { cn } from '@/lib/utils';

export function SearchPanel() {
  const open = useSearchStore((s) => s.open);
  const query = useSearchStore((s) => s.query);
  const results = useSearchStore((s) => s.results);
  const loading = useSearchStore((s) => s.loading);
  const truncated = useSearchStore((s) => s.truncated);
  const caseSensitive = useSearchStore((s) => s.caseSensitive);
  const glob = useSearchStore((s) => s.glob);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setCaseSensitive = useSearchStore((s) => s.setCaseSensitive);
  const setGlob = useSearchStore((s) => s.setGlob);
  const search = useSearchStore((s) => s.search);
  const setOpen = useSearchStore((s) => s.setOpen);
  const openFile = useEditorStore((s) => s.openFile);
  const inputRef = useRef<HTMLInputElement>(null);

  // Replace state
  const replaceMode = useSearchStore((s) => s.replaceMode);
  const replacement = useSearchStore((s) => s.replacement);
  const replaceLoading = useSearchStore((s) => s.replaceLoading);
  const replacePreview = useSearchStore((s) => s.replacePreview);
  const replaceError = useSearchStore((s) => s.replaceError);
  const setReplaceMode = useSearchStore((s) => s.setReplaceMode);
  const setReplacement = useSearchStore((s) => s.setReplacement);
  const previewReplace = useSearchStore((s) => s.previewReplace);
  const applyReplace = useSearchStore((s) => s.applyReplace);
  const clearReplacePreview = useSearchStore((s) => s.clearReplacePreview);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      search();
    },
    [search],
  );

  const handleResultClick = useCallback(
    (file: string, line: number) => {
      openFile(file, { line });
    },
    [openFile],
  );

  if (!open) return null;

  // Group results by file
  const grouped = new Map<string, Array<{ line: number; text: string }>>();
  for (const r of results) {
    const arr = grouped.get(r.file) ?? [];
    arr.push({ line: r.line, text: r.text });
    grouped.set(r.file, arr);
  }

  return (
    <div className="flex h-full w-full flex-col border-r bg-background">
      {/* Header */}
      <div className="flex h-7 items-center justify-between border-b px-3 glass-surface glass-highlight">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Search
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-0.5 hover:bg-muted-foreground/20"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 border-b p-2">
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search in files..."
              className="h-7 w-full rounded border bg-transparent pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={cn(
              'rounded p-1',
              caseSensitive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50',
            )}
            title={caseSensitive ? 'Case sensitive' : 'Case insensitive'}
          >
            <CaseSensitive className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setReplaceMode(!replaceMode)}
            className={cn(
              'rounded p-1',
              replaceMode ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50',
            )}
            title={replaceMode ? 'Hide replace' : 'Show replace'}
            aria-pressed={replaceMode}
          >
            <Replace className="h-3.5 w-3.5" />
          </button>
        </div>
        {replaceMode && (
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <Replace className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="Replace with..."
                aria-label="Replacement text"
                className="h-7 w-full rounded border bg-transparent pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button
              type="button"
              onClick={() => void previewReplace()}
              disabled={replaceLoading || results.length === 0 || !query.trim()}
              className="h-7 rounded border px-2 text-[11px] disabled:opacity-50 hover:bg-accent/50"
              title="Preview replacements (dry run)"
            >
              {replaceLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Preview'}
            </button>
          </div>
        )}
        <div className="flex items-center gap-1">
          <FileSearch className="h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={glob}
            onChange={(e) => setGlob(e.target.value)}
            placeholder="File filter (e.g. *.ts)"
            className="h-6 flex-1 rounded border bg-transparent px-2 text-[11px] outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </form>

      {/* Replace preview / apply banner */}
      {replaceMode && replacePreview && (
        <div className="border-b bg-accent/20 p-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span>
              {replacePreview.dryRun ? (
                <>
                  <b>{replacePreview.totalReplacements}</b> replacements across{' '}
                  <b>{replacePreview.filesChanged}</b>/{replacePreview.filesScanned} files.{' '}
                  {replacePreview.filesChanged > 0 && 'Apply to write changes.'}
                </>
              ) : (
                <>
                  Applied <b>{replacePreview.totalReplacements}</b> replacements across{' '}
                  <b>{replacePreview.filesChanged}</b> files.
                </>
              )}
            </span>
            <div className="flex shrink-0 gap-1">
              {replacePreview.dryRun && replacePreview.filesChanged > 0 && (
                <button
                  type="button"
                  onClick={() => void applyReplace()}
                  disabled={replaceLoading}
                  className="rounded bg-primary px-2 py-0.5 text-primary-foreground disabled:opacity-50"
                >
                  {replaceLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
                </button>
              )}
              <button
                type="button"
                onClick={clearReplacePreview}
                className="rounded border px-2 py-0.5 hover:bg-accent/50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      {replaceError && (
        <div className="flex items-start gap-1.5 border-b bg-destructive/10 p-2 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{replaceError}</span>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && (
          <div className="flex items-center justify-center p-4">
            <span className="text-xs text-muted-foreground">Searching...</span>
          </div>
        )}

        {!loading && results.length === 0 && query && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No results found.
          </div>
        )}

        {!loading && grouped.size > 0 && (
          <div className="py-1">
            {truncated && (
              <div className="px-3 py-1 text-[10px] text-amber-500">
                Results truncated to 200 matches.
              </div>
            )}
            {Array.from(grouped.entries()).map(([file, matches]) => (
              <div key={file} className="mb-1">
                <div className="px-3 py-1 text-[11px] font-medium text-foreground truncate" title={file}>
                  {file}
                  <span className="ml-1 text-muted-foreground">({matches.length})</span>
                </div>
                {matches.map((m, i) => (
                  <button
                    key={`${file}:${m.line}:${i}`}
                    type="button"
                    onClick={() => handleResultClick(file, m.line)}
                    className="flex w-full items-baseline gap-2 px-5 py-0.5 text-left text-[11px] hover:bg-accent/50"
                  >
                    <span className="shrink-0 text-muted-foreground w-8 text-right">{m.line}</span>
                    <span className="truncate text-foreground/80">{m.text}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
