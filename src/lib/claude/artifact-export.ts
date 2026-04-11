'use client';

import { extensionFor, type ExtractedArtifact } from '@/lib/claude/artifact-extractor';

export type ExportFormat = 'source' | 'md' | 'html' | 'pdf' | 'doc' | 'svg' | 'png' | 'txt' | 'file';

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

export function exportArtifact(artifact: ExtractedArtifact, format: ExportFormat): void {
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
      openPrintWindow(artifact);
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

function toStandaloneHtml(artifact: ExtractedArtifact): string {
  const title = escapeHtml(artifact.title);
  let body: string;
  if (artifact.kind === 'html') {
    return artifact.content;
  }
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
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 780px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.6; color: #111; }
pre { background: #f4f4f5; padding: 1rem; border-radius: 6px; overflow-x: auto; font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.9em; }
code { font-family: "SFMono-Regular", Consolas, monospace; }
h1, h2, h3, h4 { line-height: 1.25; }
table { border-collapse: collapse; }
td, th { border: 1px solid #ddd; padding: 0.4rem 0.6rem; }
img, svg { max-width: 100%; height: auto; }
blockquote { border-left: 4px solid #ddd; margin: 0; padding: 0 1rem; color: #555; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function openPrintWindow(artifact: ExtractedArtifact): void {
  const html = toStandaloneHtml(artifact);
  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!win) {
    downloadBlob(html, `${safeName(artifact.title)}.html`, 'text/html');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  const trigger = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
  };
  if (win.document.readyState === 'complete') {
    setTimeout(trigger, 200);
  } else {
    win.addEventListener('load', () => setTimeout(trigger, 200));
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
