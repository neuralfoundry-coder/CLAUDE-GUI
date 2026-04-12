'use client';

import { extensionFor, type ExtractedArtifact } from '@/lib/claude/artifact-extractor';

export type ExportFormat = 'source' | 'md' | 'html' | 'pdf' | 'doc' | 'svg' | 'png' | 'txt' | 'file';

export type PageOrientation = 'auto' | 'portrait' | 'landscape';
export type PageSize = 'A4' | 'Letter' | 'Legal';

export interface PdfExportOptions {
  orientation: PageOrientation;
  pageSize: PageSize;
}

export interface ExportOption {
  format: ExportFormat;
  label: string;
}

export function availableExports(artifact: ExtractedArtifact): ExportOption[] {
  // File-backed binary artifacts (docx/xlsx/pptx/pdf/image from /api/files/raw)
  // expose a single "Original file" download — everything else would require
  // a round-trip decode + re-encode we don't support.
  if (artifact.source === 'file' && artifact.filePath) {
    return [
      { format: 'file', label: `Original (.${extensionFor(artifact.language, artifact.kind)})` },
    ];
  }

  const options: ExportOption[] = [
    { format: 'source', label: `Source (.${extensionFor(artifact.language, artifact.kind)})` },
  ];
  if (artifact.kind === 'markdown') {
    options.push(
      { format: 'html', label: 'HTML (.html)' },
      { format: 'pdf', label: 'PDF (print dialog)' },
      { format: 'doc', label: 'Word (.doc)' },
    );
  } else if (artifact.kind === 'html') {
    options.push(
      { format: 'pdf', label: 'PDF (print dialog)' },
      { format: 'doc', label: 'Word (.doc)' },
    );
  } else if (artifact.kind === 'svg') {
    options.push(
      { format: 'png', label: 'PNG (.png)' },
      { format: 'pdf', label: 'PDF (print dialog)' },
    );
  } else {
    options.push(
      { format: 'pdf', label: 'PDF (print dialog)' },
      { format: 'txt', label: 'Plain text (.txt)' },
    );
  }
  return options;
}

export async function copyArtifact(artifact: ExtractedArtifact): Promise<void> {
  if (artifact.source === 'file') {
    await navigator.clipboard.writeText(artifact.filePath ?? artifact.title);
    return;
  }
  await navigator.clipboard.writeText(artifact.content);
}

async function downloadBinaryFile(artifact: ExtractedArtifact): Promise<void> {
  if (!artifact.filePath) return;
  const tryFetch = async (url: string): Promise<Blob | null> => {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  };
  // Registry first so captured binaries still download after a project switch.
  const blob =
    (await tryFetch(`/api/artifacts/raw?path=${encodeURIComponent(artifact.filePath)}`)) ??
    (await tryFetch(`/api/files/raw?path=${encodeURIComponent(artifact.filePath)}`));
  if (!blob) throw new Error('Download failed');
  const ext = extensionFor(artifact.language, artifact.kind);
  triggerDownload(blob, `${safeName(artifact.title)}.${ext}`);
}

export function exportArtifact(
  artifact: ExtractedArtifact,
  format: ExportFormat,
  pdfOptions?: PdfExportOptions,
): void {
  switch (format) {
    case 'file': {
      void downloadBinaryFile(artifact).catch((err) => {
        console.error('[artifacts] download failed', err);
      });
      return;
    }
    case 'source': {
      const ext = extensionFor(artifact.language, artifact.kind);
      downloadBlob(artifact.content, `${safeName(artifact.title)}.${ext}`, mimeForExt(ext));
      return;
    }
    case 'md': {
      downloadBlob(artifact.content, `${safeName(artifact.title)}.md`, 'text/markdown');
      return;
    }
    case 'txt': {
      downloadBlob(artifact.content, `${safeName(artifact.title)}.txt`, 'text/plain');
      return;
    }
    case 'html': {
      const html = toStandaloneHtml(artifact);
      downloadBlob(html, `${safeName(artifact.title)}.html`, 'text/html');
      return;
    }
    case 'doc': {
      const html = toStandaloneHtml(artifact);
      const wordHtml =
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
        'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
        html +
        '</html>';
      downloadBlob(wordHtml, `${safeName(artifact.title)}.doc`, 'application/msword');
      return;
    }
    case 'pdf': {
      printViaIframe(artifact, pdfOptions);
      return;
    }
    case 'svg': {
      downloadBlob(artifact.content, `${safeName(artifact.title)}.svg`, 'image/svg+xml');
      return;
    }
    case 'png': {
      void svgToPng(artifact).then((blob) => {
        if (blob) triggerDownload(blob, `${safeName(artifact.title)}.png`);
      });
      return;
    }
  }
}

function safeName(title: string): string {
  const cleaned = title.replace(/[^a-zA-Z0-9_\- ]+/g, '').trim().replace(/\s+/g, '-');
  return cleaned || 'artifact';
}

function mimeForExt(ext: string): string {
  const table: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    svg: 'image/svg+xml',
    md: 'text/markdown',
    mdx: 'text/markdown',
    json: 'application/json',
    css: 'text/css',
    js: 'text/javascript',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    py: 'text/x-python',
  };
  return table[ext] ?? 'text/plain';
}

function downloadBlob(content: string, filename: string, mime: string): void {
  triggerDownload(new Blob([content], { type: mime }), filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function buildPrintCss(options?: PdfExportOptions): string {
  const size = options?.pageSize ?? 'A4';
  const orientation = options?.orientation ?? 'auto';
  // For 'auto', we don't inject @page size — let the HTML's own @page rules take effect.
  // If HTML has no @page rules, the browser default (usually portrait A4/Letter) applies.
  const pageRule =
    orientation === 'auto'
      ? '' // no @page override — respect existing rules
      : `@page { size: ${size} ${orientation === 'landscape' ? 'landscape' : 'portrait'}; margin: 15mm; }`;

  return `
${pageRule}
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Avoid breaking inside key block elements */
  pre, figure, table, img, svg, blockquote { page-break-inside: avoid; break-inside: avoid; }
  /* Section-level page breaks: <hr>, slide/section boundaries */
  hr { page-break-after: always; break-after: page; visibility: hidden; height: 0; margin: 0; border: 0; }
  section, .slide, [data-page-break] { page-break-before: always; break-before: page; }
  /* Heading orphan control */
  h1, h2, h3, h4, h5, h6 { page-break-after: avoid; break-after: avoid; }
  a { color: inherit; text-decoration: none; }
}
`;
}

// Legacy constant kept for non-PDF uses (toStandaloneHtml for doc/html export).
const PRINT_CSS = buildPrintCss();

const BASE_STYLE = `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 780px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.6; color: #111; }
pre { background: #f4f4f5; padding: 1rem; border-radius: 6px; overflow-x: auto; font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.9em; white-space: pre-wrap; word-break: break-word; }
code { font-family: "SFMono-Regular", Consolas, monospace; }
h1, h2, h3, h4 { line-height: 1.25; }
table { border-collapse: collapse; }
td, th { border: 1px solid #ddd; padding: 0.4rem 0.6rem; }
img, svg { max-width: 100%; height: auto; }
figure { margin: 0; }
blockquote { border-left: 4px solid #ddd; margin: 0; padding: 0 1rem; color: #555; }
`;

function toStandaloneHtml(artifact: ExtractedArtifact, pdfOptions?: PdfExportOptions): string {
  const title = escapeHtml(artifact.title);
  if (artifact.kind === 'html') {
    return injectPrintStyles(artifact.content, pdfOptions);
  }
  const printCss = pdfOptions ? buildPrintCss(pdfOptions) : PRINT_CSS;
  let body: string;
  if (artifact.kind === 'markdown') {
    body = markdownToHtml(artifact.content);
  } else if (artifact.kind === 'svg') {
    body = `<figure>${artifact.content}</figure>`;
  } else {
    body = `<pre><code>${escapeHtml(artifact.content)}</code></pre>`;
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${BASE_STYLE}${printCss}</style>
</head>
<body>
${body}
</body>
</html>`;
}

// Ensures user-supplied HTML documents pick up our @page / @media print rules.
// Leaves the original markup untouched apart from a single injected <style> tag.
function injectPrintStyles(html: string, options?: PdfExportOptions): string {
  const css = options ? buildPrintCss(options) : PRINT_CSS;
  const styleTag = `<style data-artifact-print>${css}</style>`;
  if (/<\/head\s*>/i.test(html)) {
    return html.replace(/<\/head\s*>/i, `${styleTag}</head>`);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${styleTag}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${styleTag}</head>`);
  }
  return `<!doctype html><html><head>${styleTag}</head><body>${html}</body></html>`;
}

const LARGE_HTML_THRESHOLD = 1_500_000;

function printViaIframe(artifact: ExtractedArtifact, pdfOptions?: PdfExportOptions): void {
  try {
    const html = toStandaloneHtml(artifact, pdfOptions);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';

    let blobUrl: string | null = null;
    let cleaned = false;
    let safetyTimer: number | null = null;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (safetyTimer !== null) {
        window.clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
    };

    const triggerPrint = () => {
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      if (!win || !doc) {
        console.warn('[artifacts] print iframe has no contentWindow; falling back to download');
        cleanup();
        downloadBlob(html, `${safeName(artifact.title)}.html`, 'text/html');
        return;
      }
      const images = Array.from(doc.images) as HTMLImageElement[];
      const decodes = images.map((img) =>
        typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve(),
      );
      void Promise.all(decodes).then(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              win.addEventListener('afterprint', cleanup, { once: true });
              win.focus();
              win.print();
              // Safety net: if afterprint never fires (some webviews), reclaim
              // the iframe after a minute so we do not leak DOM nodes.
              safetyTimer = window.setTimeout(cleanup, 60_000);
            } catch (err) {
              console.warn('[artifacts] iframe print failed; falling back to download', err);
              cleanup();
              downloadBlob(html, `${safeName(artifact.title)}.html`, 'text/html');
            }
          });
        });
      });
    };

    iframe.addEventListener('load', triggerPrint, { once: true });

    if (html.length > LARGE_HTML_THRESHOLD) {
      // Very large srcdoc values get truncated in some browsers. Use a blob URL
      // instead so the iframe can still receive the full document.
      const blob = new Blob([html], { type: 'text/html' });
      blobUrl = URL.createObjectURL(blob);
      iframe.src = blobUrl;
    } else {
      iframe.srcdoc = html;
    }

    document.body.appendChild(iframe);
  } catch (err) {
    console.warn('[artifacts] printViaIframe failed; falling back to download', err);
    const html = toStandaloneHtml(artifact);
    downloadBlob(html, `${safeName(artifact.title)}.html`, 'text/html');
  }
}

async function svgToPng(artifact: ExtractedArtifact): Promise<Blob | null> {
  return new Promise((resolve) => {
    const svgBlob = new Blob([artifact.content], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const w = img.naturalWidth || 1024;
      const h = img.naturalHeight || 1024;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        resolve(blob);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Heuristically detect whether an HTML document is likely intended for
 * landscape output (e.g. presentations, wide tables, explicit CSS).
 */
export function detectLandscapeHint(html: string): boolean {
  // Explicit CSS @page landscape rule
  if (/@page\s*\{[^}]*landscape/i.test(html)) return true;
  // Reveal.js or slide-like structure
  if (/class\s*=\s*["'][^"']*\breveal\b/i.test(html)) return true;
  if (/<section[\s>]/i.test(html) && /<\/section>/i.test(html)) {
    // Multiple <section> elements suggest a slide deck
    const sectionCount = (html.match(/<section[\s>]/gi) ?? []).length;
    if (sectionCount >= 3) return true;
  }
  // Viewport meta with width much larger than height (presentation hint)
  const viewportMatch = html.match(/content\s*=\s*["'][^"']*width\s*=\s*(\d+)[^"']*height\s*=\s*(\d+)/i);
  if (viewportMatch) {
    const w = parseInt(viewportMatch[1]!, 10);
    const h = parseInt(viewportMatch[2]!, 10);
    if (w > h * 1.2) return true;
  }
  return false;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeLang = '';
  let codeBuf: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length > 0) {
      out.push(`<p>${inline(paraBuf.join(' '))}</p>`);
      paraBuf = [];
    }
  };
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    if (inCode) {
      if (raw.trim().startsWith('```')) {
        out.push(
          `<pre><code${codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ''}>` +
            escapeHtml(codeBuf.join('\n')) +
            '</code></pre>',
        );
        inCode = false;
        codeLang = '';
        codeBuf = [];
      } else {
        codeBuf.push(raw);
      }
      continue;
    }
    const fence = raw.trim().match(/^```(.*)$/);
    if (fence) {
      flushPara();
      closeList();
      inCode = true;
      codeLang = (fence[1] ?? '').trim();
      continue;
    }
    const heading = raw.match(/^(#{1,6})\s+(.*)$/);
    if (heading && heading[1] && heading[2] !== undefined) {
      flushPara();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const ulMatch = raw.match(/^\s*[-*+]\s+(.*)$/);
    const olMatch = raw.match(/^\s*\d+\.\s+(.*)$/);
    if (ulMatch && ulMatch[1] !== undefined) {
      flushPara();
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${inline(ulMatch[1])}</li>`);
      continue;
    }
    if (olMatch && olMatch[1] !== undefined) {
      flushPara();
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${inline(olMatch[1])}</li>`);
      continue;
    }
    if (raw.trim() === '') {
      flushPara();
      closeList();
      continue;
    }
    if (raw.startsWith('> ')) {
      flushPara();
      closeList();
      out.push(`<blockquote>${inline(raw.slice(2))}</blockquote>`);
      continue;
    }
    paraBuf.push(raw);
  }
  if (inCode) {
    out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  }
  flushPara();
  closeList();
  return out.join('\n');
}

function inline(text: string): string {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t;
}
