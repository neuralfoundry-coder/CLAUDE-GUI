export interface HtmlExtractorEvents {
  onStart?: () => void;
  onChunk?: (html: string, meta: { renderable: boolean }) => void;
  onComplete?: (html: string) => void;
  onReset?: () => void;
  onWritePath?: (filePath: string) => void;
  /**
   * Emitted when an Edit/MultiEdit arrives but the extractor has no baseline
   * HTML to patch against. The consumer is expected to fetch the file content
   * (e.g. via the files API) and invoke `apply(baseline)` with it; the
   * extractor then applies the queued edits on top and emits onChunk/onComplete.
   */
  onNeedBaseline?: (filePath: string, apply: (baseline: string) => void) => void;
}

type FenceState = 'idle' | 'in-fence';

interface EditOp {
  oldString: string;
  newString: string;
  replaceAll: boolean;
}

const FENCE_OPEN = /```(?:html|HTML)\s*\n/;
const FENCE_CLOSE = /\n```/;

export function isRenderable(html: string): boolean {
  if (!html) return false;
  if (/<!doctype/i.test(html)) return true;
  if (/<html[\s>]/i.test(html)) return true;
  if (/<body[\s>]/i.test(html)) return true;
  // Fallback: at least one fully balanced top-level element
  const match = html.match(/<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/);
  if (!match) return false;
  const tag = match[1]!.toLowerCase();
  const closeTag = new RegExp(`</${tag}\\s*>`, 'i');
  return closeTag.test(html);
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

function applyEditOps(baseline: string, ops: EditOp[]): string {
  let result = baseline;
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

/**
 * Scans sequential text chunks from Claude's assistant content for fenced
 * ```html blocks, and also accepts `tool_use` events with Write/Edit on HTML
 * files. Emits start/chunk/complete events so a preview store can render
 * partial HTML live.
 *
 * For `Edit`/`MultiEdit` tool_use events on `.html` files, the extractor
 * applies `old_string → new_string` replacements against the last known full
 * HTML (from a prior `Write`, a completed fenced block, or `seedBaseline()`)
 * instead of treating the `new_string` snippet as the full document. This
 * preserves the rest of a multi-page document when only one section is edited.
 */
export class HtmlStreamExtractor {
  private buffer = '';
  private fenceState: FenceState = 'idle';
  private fenceStart = -1;
  private started = false;
  private lastFullHtml = '';

  constructor(private readonly events: HtmlExtractorEvents = {}) {}

  reset(): void {
    this.buffer = '';
    this.fenceState = 'idle';
    this.fenceStart = -1;
    this.started = false;
    this.lastFullHtml = '';
    this.events.onReset?.();
  }

  /** Prime the extractor with an existing full HTML document so later edits can patch it. */
  seedBaseline(html: string): void {
    if (typeof html === 'string' && html.length > 0) {
      this.lastFullHtml = html;
    }
  }

  /** Feed a text chunk from an assistant text block. */
  feedText(chunk: string): void {
    this.buffer += chunk;
    this.scan();
  }

  /** Feed a tool_use block. Write/Edit/MultiEdit of .html files feed the preview. */
  feedToolUse(tool: { name?: string; input?: unknown }): void {
    if (!tool.input || typeof tool.input !== 'object') return;
    const name = tool.name ?? '';
    const input = tool.input as Record<string, unknown>;
    const filePath = typeof input.file_path === 'string' ? input.file_path : '';
    if (!/\.html?$/i.test(filePath)) return;

    if (name === 'Write') {
      const content = typeof input.content === 'string' ? input.content : '';
      if (!content) return;
      this.ensureStart();
      this.events.onWritePath?.(filePath);
      this.lastFullHtml = content;
      this.events.onChunk?.(content, { renderable: isRenderable(content) });
      this.events.onComplete?.(content);
      return;
    }

    if (name !== 'Edit' && name !== 'MultiEdit') return;

    const ops = extractEditOps(input);
    if (ops.length === 0) return;

    const applyWithBaseline = (baseline: string): void => {
      const next = applyEditOps(baseline, ops);
      this.lastFullHtml = next;
      this.ensureStart();
      this.events.onWritePath?.(filePath);
      this.events.onChunk?.(next, { renderable: isRenderable(next) });
      this.events.onComplete?.(next);
    };

    if (this.lastFullHtml) {
      applyWithBaseline(this.lastFullHtml);
      return;
    }
    this.events.onNeedBaseline?.(filePath, applyWithBaseline);
  }

  /** Called at end of stream — emits complete if an open fence had content. */
  finalize(): void {
    if (this.fenceState === 'in-fence' && this.fenceStart >= 0) {
      const html = this.buffer.slice(this.fenceStart);
      if (html) {
        this.lastFullHtml = html;
        this.events.onComplete?.(html);
      }
    }
  }

  private ensureStart(): void {
    if (!this.started) {
      this.started = true;
      this.events.onStart?.();
    }
  }

  private scan(): void {
    if (this.fenceState === 'idle') {
      const openMatch = this.buffer.match(FENCE_OPEN);
      if (!openMatch || openMatch.index === undefined) return;
      this.fenceState = 'in-fence';
      this.fenceStart = openMatch.index + openMatch[0].length;
      this.ensureStart();
    }
    if (this.fenceState === 'in-fence' && this.fenceStart >= 0) {
      const tail = this.buffer.slice(this.fenceStart);
      const closeMatch = tail.match(FENCE_CLOSE);
      if (closeMatch && closeMatch.index !== undefined) {
        const html = tail.slice(0, closeMatch.index);
        this.lastFullHtml = html;
        this.events.onChunk?.(html, { renderable: isRenderable(html) });
        this.events.onComplete?.(html);
        this.fenceState = 'idle';
        this.fenceStart = -1;
      } else {
        const html = tail;
        this.events.onChunk?.(html, { renderable: isRenderable(html) });
      }
    }
  }
}
