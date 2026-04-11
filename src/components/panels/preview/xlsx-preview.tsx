'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { fetchArtifactBytes } from '@/lib/claude/artifact-url';

interface XlsxPreviewProps {
  path: string;
}

interface SheetData {
  name: string;
  html: string;
}

/**
 * Client-side `.xlsx` preview via SheetJS. Every sheet is rendered as an HTML
 * table; the user switches between sheets with tabs. Only the active sheet's
 * table is mounted.
 */
export function XlsxPreview({ path }: XlsxPreviewProps) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSheets([]);
    setActive(0);

    (async () => {
      try {
        const buf = await fetchArtifactBytes(path);
        const xlsx = (await import('xlsx')) as typeof import('xlsx');
        const wb = xlsx.read(buf, { type: 'array' });
        const out: SheetData[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          if (!ws) return { name, html: '<p>Empty sheet</p>' };
          const html = xlsx.utils.sheet_to_html(ws, { header: '', footer: '' });
          return { name, html };
        });
        if (!cancelled) setSheets(out);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render xlsx');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  const activeHtml = useMemo(() => sheets[active]?.html ?? '', [sheets, active]);

  if (loading) return <div className="p-4 text-xs text-muted-foreground">Loading Excel workbook…</div>;
  if (error) return <div className="p-4 text-xs text-red-500">{error}</div>;
  if (sheets.length === 0) return <div className="p-4 text-xs text-muted-foreground">Empty workbook.</div>;

  const wrapped = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           padding: 0.75rem; color: #111; background: #fff; }
    table { border-collapse: collapse; font-size: 12px; }
    td, th { border: 1px solid #ddd; padding: 0.3rem 0.5rem; white-space: nowrap; }
    tr:nth-child(even) td { background: #f9fafb; }
  </style></head><body>${activeHtml}</body></html>`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {sheets.length > 1 && (
        <div className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto border-b bg-muted/30 px-2 py-1">
          {sheets.map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                'rounded px-2 py-0.5 text-[11px]',
                i === active ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <iframe
        key={`${path}-${active}`}
        title={`${path} — ${sheets[active]?.name ?? ''}`}
        sandbox=""
        srcDoc={wrapped}
        className="h-full min-h-[400px] w-full flex-1"
      />
    </div>
  );
}
