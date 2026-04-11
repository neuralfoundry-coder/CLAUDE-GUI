'use client';

import type { ExtractedArtifact, ArtifactKind } from '@/lib/claude/artifact-extractor';
import {
  availableExports,
  exportArtifact,
  type ExportOption,
  type ExportFormat,
} from '@/lib/claude/artifact-export';
import type { PreviewType } from '@/stores/use-preview-store';

export type { ExportFormat, ExportOption };

export interface PreviewDownloadInput {
  filePath: string;
  type: Exclude<PreviewType, 'none'>;
  content: string;
}

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

function extOf(p: string): string {
  return p.split('.').pop()?.toLowerCase() ?? '';
}

function isSvgImage(filePath: string): boolean {
  return extOf(filePath) === 'svg';
}

/**
 * Adapt a live preview (type + path + in-memory content) into the
 * `ExtractedArtifact` shape expected by the artifact export pipeline.
 * Inline text previews (html/markdown/slides) use `source: 'inline'` so
 * format conversions (html, pdf, doc…) work on current editor content.
 * File-backed previews (pdf/image/docx/xlsx/pptx) use `source: 'file'`
 * so the download streams the original bytes via `/api/files/raw`.
 */
function toArtifact(input: PreviewDownloadInput): ExtractedArtifact {
  const title = stripExt(basename(input.filePath)) || 'preview';
  const now = Date.now();
  const base = {
    id: `preview:${input.filePath}`,
    messageId: 'preview',
    sessionId: null,
    index: 0,
    title,
    createdAt: now,
    updatedAt: now,
  } as const;

  let kind: ArtifactKind;
  let language: string;

  switch (input.type) {
    case 'html':
      kind = 'html';
      language = 'html';
      return { ...base, kind, language, content: input.content, source: 'inline' };
    case 'markdown':
      kind = 'markdown';
      language = 'md';
      return { ...base, kind, language, content: input.content, source: 'inline' };
    case 'slides':
      // Reveal.js slide sources are authored as Markdown; exporting them as
      // markdown / html / print-PDF goes through the same pipeline.
      kind = 'markdown';
      language = 'md';
      return { ...base, kind, language, content: input.content, source: 'inline' };
    case 'image': {
      // SVG is text and can be re-exported as PNG; raster images are file-backed.
      if (isSvgImage(input.filePath) && input.content) {
        return {
          ...base,
          kind: 'svg',
          language: 'svg',
          content: input.content,
          source: 'inline',
        };
      }
      kind = 'image';
      language = extOf(input.filePath) || 'png';
      return {
        ...base,
        kind,
        language,
        content: '',
        filePath: input.filePath,
        source: 'file',
      };
    }
    case 'pdf':
      return {
        ...base,
        kind: 'pdf',
        language: 'pdf',
        content: '',
        filePath: input.filePath,
        source: 'file',
      };
    case 'docx':
      return {
        ...base,
        kind: 'docx',
        language: 'docx',
        content: '',
        filePath: input.filePath,
        source: 'file',
      };
    case 'xlsx':
      return {
        ...base,
        kind: 'xlsx',
        language: 'xlsx',
        content: '',
        filePath: input.filePath,
        source: 'file',
      };
    case 'pptx':
      return {
        ...base,
        kind: 'pptx',
        language: 'pptx',
        content: '',
        filePath: input.filePath,
        source: 'file',
      };
  }
}

export function previewDownloadOptions(input: PreviewDownloadInput): ExportOption[] {
  return availableExports(toArtifact(input));
}

export function downloadPreview(input: PreviewDownloadInput, format: ExportFormat): void {
  exportArtifact(toArtifact(input), format);
}
