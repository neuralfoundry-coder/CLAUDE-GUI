export interface HtmlExtractorEvents {
  onStart?: () => void;
  onChunk?: (html: string, meta: { renderable: boolean }) => void;
  onComplete?: (html: string) => void;
  onReset?: () => void;
}

type FenceState = 'idle' | 'in-fence';

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

/**
 * Scans sequential text chunks from Claude's assistant content for fenced
 * ```html blocks, and also accepts `tool_use` events with Write/Edit on HTML
 * files. Emits start/chunk/complete events so a preview store can render
 * partial HTML live.
 */
export class HtmlStreamExtractor {
  private buffer = '';
  private fenceState: FenceState = 'idle';
  private fenceStart = -1;
  private started = false;

  constructor(private readonly events: HtmlExtractorEvents = {}) {}

  reset(): void {
    this.buffer = '';
    this.fenceState = 'idle';
    this.fenceStart = -1;
    this.started = false;
    this.events.onReset?.();
  }

  /** Feed a text chunk from an assistant text block. */
  feedText(chunk: string): void {
    this.buffer += chunk;
    this.scan();
  }

  /** Feed a tool_use block. Write/Edit of .html files becomes an immediate full-HTML chunk. */
  feedToolUse(tool: { name?: string; input?: unknown }): void {
    if (!tool.input || typeof tool.input !== 'object') return;
    const name = tool.name ?? '';
    if (name !== 'Write' && name !== 'Edit' && name !== 'MultiEdit') return;
    const input = tool.input as Record<string, unknown>;
    const filePath = typeof input.file_path === 'string' ? input.file_path : '';
    if (!/\.html?$/i.test(filePath)) return;
    const full =
      typeof input.content === 'string'
        ? input.content
        : typeof input.new_string === 'string'
          ? input.new_string
          : '';
    if (!full) return;
    this.ensureStart();
    this.events.onChunk?.(full, { renderable: isRenderable(full) });
    this.events.onComplete?.(full);
  }

  /** Called at end of stream — emits complete if an open fence had content. */
  finalize(): void {
    if (this.fenceState === 'in-fence' && this.fenceStart >= 0) {
      const html = this.buffer.slice(this.fenceStart);
      if (html) this.events.onComplete?.(html);
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
