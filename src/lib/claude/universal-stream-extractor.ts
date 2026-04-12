import { isRenderable } from './html-stream-extractor';

export type StreamPageKind = 'html' | 'svg' | 'markdown' | 'code' | 'text';

export interface StreamPage {
  id: string;
  kind: StreamPageKind;
  language: string;
  title: string;
  content: string;
  filePath?: string;
  renderable: boolean;
  complete: boolean;
}

export interface UniversalExtractorEvents {
  onPageStart?: (page: StreamPage) => void;
  onPageChunk?: (pageId: string, content: string, renderable: boolean) => void;
  onPageComplete?: (pageId: string, content: string) => void;
  onWritePath?: (pageId: string, filePath: string) => void;
  onNeedBaseline?: (filePath: string, apply: (baseline: string) => void) => void;
}

// ---- Classification helpers ----

const MARKDOWN_LANGS = new Set(['md', 'markdown', 'mdx']);
const HTML_LANGS = new Set(['html', 'htm', 'xhtml']);
const SVG_LANGS = new Set(['svg']);

function classifyLang(language: string, content: string): StreamPageKind {
  const lang = language.toLowerCase();
  if (SVG_LANGS.has(lang)) return 'svg';
  if (HTML_LANGS.has(lang)) return 'html';
  if (MARKDOWN_LANGS.has(lang)) return 'markdown';
  if (lang) return 'code';
  const trimmed = content.trimStart().toLowerCase();
  if (trimmed.startsWith('<svg')) return 'svg';
  if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) return 'html';
  return 'text';
}

const EXT_MAP: Record<string, StreamPageKind> = {
  html: 'html', htm: 'html', xhtml: 'html',
  svg: 'svg',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
};

function classifyByPath(filePath: string): { kind: StreamPageKind; language: string } {
  const dot = filePath.lastIndexOf('.');
  const ext = dot > 0 ? filePath.slice(dot + 1).toLowerCase() : '';
  const kind = EXT_MAP[ext] ?? (ext ? 'code' : 'text');
  return { kind, language: ext || 'text' };
}

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

// ---- Renderable checks ----

function isSvgRenderable(html: string): boolean {
  return /<\/svg>/i.test(html);
}

function checkRenderable(kind: StreamPageKind, content: string): boolean {
  if (kind === 'html') return isRenderable(content);
  if (kind === 'svg') return isSvgRenderable(content);
  if (kind === 'markdown') return content.length > 0;
  return false; // code/text are source-only
}

// ---- Edit ops (reused from html-stream-extractor pattern) ----

interface EditOp {
  oldString: string;
  newString: string;
  replaceAll: boolean;
}

function extractEditOps(input: Record<string, unknown>): EditOp[] {
  const ops: EditOp[] = [];
  if (typeof input.old_string === 'string' && typeof input.new_string === 'string') {
    ops.push({
      oldString: input.old_string,
      newString: input.new_string,
      replaceAll: input.replace_all === true,
    });
  }
  if (Array.isArray(input.edits)) {
    for (const entry of input.edits) {
      if (!entry || typeof entry !== 'object') continue;
      const obj = entry as Record<string, unknown>;
      if (typeof obj.old_string !== 'string' || typeof obj.new_string !== 'string') continue;
      ops.push({
        oldString: obj.old_string,
        newString: obj.new_string,
        replaceAll: obj.replace_all === true,
      });
    }
  }
  return ops;
}

function applyEditOps(base: string, ops: EditOp[]): string {
  let result = base;
  for (const op of ops) {
    if (op.replaceAll) {
      if (op.oldString) result = result.split(op.oldString).join(op.newString);
      continue;
    }
    const idx = result.indexOf(op.oldString);
    if (idx < 0) continue;
    result = result.slice(0, idx) + op.newString + result.slice(idx + op.oldString.length);
  }
  return result;
}

// ---- Fence scanning ----

const FENCE_OPEN = /```([a-zA-Z0-9+._-]*)\s*\n/;

type FenceState = 'idle' | 'in-fence';

/**
 * Universal stream extractor: scans assistant text for fenced code blocks of
 * ANY language and feeds Write/Edit/MultiEdit tool_use for ANY file type.
 * Each distinct block or tool_use becomes a "page" that emits start/chunk/complete.
 */
export class UniversalStreamExtractor {
  private buffer = '';
  private fenceState: FenceState = 'idle';
  private fenceStart = -1;
  private fenceLanguage = '';
  private fencePageId: string | null = null;
  private pageCounter = 0;
  /** Offset up to which we have scanned — avoids O(n²) re-scanning on each chunk. */
  private scanOffset = 0;
  /** Per-filePath baseline for Edit/MultiEdit patching */
  private baselines = new Map<string, string>();
  /** Per-filePath page ID for deduplication of Write/Edit on same file */
  private filePages = new Map<string, string>();

  constructor(private readonly events: UniversalExtractorEvents = {}) {}

  private nextPageId(): string {
    this.pageCounter += 1;
    return `sp-${Date.now()}-${this.pageCounter}`;
  }

  /** Prime the extractor with a known baseline for a file path. */
  seedBaseline(filePath: string, html: string): void {
    if (html) this.baselines.set(filePath, html);
  }

  /** Feed a text chunk from an assistant text block. */
  feedText(chunk: string): void {
    this.buffer += chunk;
    this.scan();
  }

  /** Feed a tool_use block. */
  feedToolUse(tool: { name?: string; input?: unknown }): void {
    if (!tool.input || typeof tool.input !== 'object') return;
    const name = tool.name ?? '';
    const input = tool.input as Record<string, unknown>;
    const filePath = typeof input.file_path === 'string' ? input.file_path : '';
    if (!filePath) return;

    const { kind, language } = classifyByPath(filePath);

    if (name === 'Write') {
      const content = typeof input.content === 'string' ? input.content : '';
      if (!content) return;
      this.baselines.set(filePath, content);
      const pageId = this.getOrCreateFilePage(filePath, kind, language, content);
      this.events.onWritePath?.(pageId, filePath);
      this.events.onPageChunk?.(pageId, content, checkRenderable(kind, content));
      this.events.onPageComplete?.(pageId, content);
      return;
    }

    if (name !== 'Edit' && name !== 'MultiEdit') return;

    const ops = extractEditOps(input);
    if (ops.length === 0) return;

    const applyWithBaseline = (base: string): void => {
      const next = applyEditOps(base, ops);
      this.baselines.set(filePath, next);
      const pageId = this.getOrCreateFilePage(filePath, kind, language, next);
      this.events.onWritePath?.(pageId, filePath);
      this.events.onPageChunk?.(pageId, next, checkRenderable(kind, next));
      this.events.onPageComplete?.(pageId, next);
    };

    const existingBaseline = this.baselines.get(filePath);
    if (existingBaseline) {
      applyWithBaseline(existingBaseline);
      return;
    }
    this.events.onNeedBaseline?.(filePath, applyWithBaseline);
  }

  /** Called at end of stream. */
  finalize(): void {
    if (this.fenceState === 'in-fence' && this.fenceStart >= 0 && this.fencePageId) {
      const content = this.buffer.slice(this.fenceStart);
      if (content) {
        const kind = classifyLang(this.fenceLanguage, content);
        this.events.onPageComplete?.(this.fencePageId, content);
        // Store as baseline if it looks like a full HTML doc
        if (kind === 'html') this.baselines.set('__last_html__', content);
      }
    }
    this.fenceState = 'idle';
    this.fencePageId = null;
  }

  reset(): void {
    this.buffer = '';
    this.fenceState = 'idle';
    this.fenceStart = -1;
    this.fenceLanguage = '';
    this.fencePageId = null;
    this.pageCounter = 0;
    this.scanOffset = 0;
    this.baselines.clear();
    this.filePages.clear();
  }

  // ---- Private ----

  private getOrCreateFilePage(
    filePath: string,
    kind: StreamPageKind,
    language: string,
    content: string,
  ): string {
    const existing = this.filePages.get(filePath);
    if (existing) return existing;

    const pageId = this.nextPageId();
    this.filePages.set(filePath, pageId);
    const page: StreamPage = {
      id: pageId,
      kind,
      language,
      title: basename(filePath),
      content,
      filePath,
      renderable: checkRenderable(kind, content),
      complete: false,
    };
    this.events.onPageStart?.(page);
    return pageId;
  }

  private scan(): void {
    if (this.fenceState === 'idle') {
      // Scan only from scanOffset, backing up a small margin to catch
      // partial fence openers split across chunks (e.g. "``" | "`html\n").
      const from = Math.max(0, this.scanOffset - 10);
      const sub = this.buffer.slice(from);
      const openMatch = sub.match(FENCE_OPEN);
      if (!openMatch || openMatch.index === undefined) {
        // No fence found — advance scanOffset so we never re-scan this region.
        this.scanOffset = Math.max(0, this.buffer.length - 10);
        return;
      }
      this.fenceState = 'in-fence';
      this.fenceStart = from + openMatch.index + openMatch[0].length;
      this.fenceLanguage = (openMatch[1] ?? '').trim();
      // Begin close-fence scanning from fenceStart
      this.scanOffset = this.fenceStart;

      // Create a new page for this fence
      const kind = classifyLang(this.fenceLanguage, '');
      const pageId = this.nextPageId();
      this.fencePageId = pageId;
      const page: StreamPage = {
        id: pageId,
        kind,
        language: this.fenceLanguage || kind,
        title: this.fenceLanguage ? `${this.fenceLanguage} snippet` : 'code snippet',
        content: '',
        renderable: false,
        complete: false,
      };
      this.events.onPageStart?.(page);
    }

    if (this.fenceState === 'in-fence' && this.fenceStart >= 0 && this.fencePageId) {
      // Use indexOf from scanOffset instead of regex on the full tail — O(chunk) not O(buffer).
      const CLOSE_NEEDLE = '\n```';
      const searchFrom = Math.max(this.fenceStart, this.scanOffset - 3);
      const closeIdx = this.buffer.indexOf(CLOSE_NEEDLE, searchFrom);

      const tail = this.buffer.slice(this.fenceStart);
      const kind = classifyLang(this.fenceLanguage, tail);

      if (closeIdx >= 0) {
        const content = this.buffer.slice(this.fenceStart, closeIdx);
        this.events.onPageChunk?.(this.fencePageId, content, checkRenderable(kind, content));
        this.events.onPageComplete?.(this.fencePageId, content);
        if (kind === 'html') this.baselines.set('__last_html__', content);

        // Reset fence state for next potential fence
        this.fenceState = 'idle';
        const consumed = closeIdx + CLOSE_NEEDLE.length;
        this.buffer = this.buffer.slice(consumed);
        this.fenceStart = -1;
        this.fencePageId = null;
        this.fenceLanguage = '';
        this.scanOffset = 0;

        // Check if there's another fence in the remaining buffer
        this.scan();
      } else {
        // Still accumulating — advance scanOffset so next call only searches new data.
        this.scanOffset = Math.max(this.fenceStart, this.buffer.length - 3);
        // Emit accumulated content as a progressive chunk
        this.events.onPageChunk?.(this.fencePageId, tail, checkRenderable(kind, tail));
      }
    }
  }
}
