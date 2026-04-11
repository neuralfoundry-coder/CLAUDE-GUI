'use client';

import { useEffect, useState } from 'react';
import { fetchArtifactBytes } from '@/lib/claude/artifact-url';

interface DocxPreviewProps {
  path: string;
}

/**
 * Client-side .docx preview. We fetch the raw bytes via `/api/files/raw` and
 * convert them to HTML with `mammoth`, then render inside a sandboxed iframe.
 * Mammoth is imported dynamically so its ~800KB bundle only loads when a
 * Word document is actually opened.
 */
export function DocxPreview({ path }: DocxPreviewProps) {
  const [html, setHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHtml('');

    (async () => {
      try {
        const buf = await fetchArtifactBytes(path);
        const mammoth = (await import('mammoth/mammoth.browser')) as unknown as {
          convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
        };
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (!cancelled) setHtml(result.value);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render docx');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  if (loading) return <div className="p-4 text-xs text-muted-foreground">Loading Word document…</div>;
  if (error) return <div className="p-4 text-xs text-red-500">{error}</div>;

  const wrapped = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           max-width: 780px; margin: 2rem auto; padding: 0 1.5rem;
           line-height: 1.6; color: #111; background: #fff; }
    h1, h2, h3, h4 { line-height: 1.25; }
    table { border-collapse: collapse; }
    td, th { border: 1px solid #ddd; padding: 0.4rem 0.6rem; }
    img { max-width: 100%; height: auto; }
  </style></head><body>${html}</body></html>`;

  return (
    <iframe
      title={path}
      sandbox=""
      srcDoc={wrapped}
      className="h-full min-h-[400px] w-full bg-white"
    />
  );
}
