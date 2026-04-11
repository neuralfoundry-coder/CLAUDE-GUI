import {
  classifyByPath,
  extensionFor,
  isBinaryKind,
  titleFromPath,
  type ArtifactKind,
  type ExtractedArtifact,
} from '@/lib/claude/artifact-extractor';

export interface ToolUseLike {
  name?: string;
  input?: unknown;
}

export interface ToolUseContext {
  messageId: string;
  sessionId: string | null;
  now?: number;
}

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

export function applyEditOps(baseline: string, ops: EditOp[]): string {
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

function stableIdFor(filePath: string): string {
  // Normalize so `/a/b/c.html` and `/a/b/./c.html` collapse to one artifact.
  return `file:${filePath.replace(/\\/g, '/').replace(/\/\.\//g, '/')}`;
}

function languageFromKind(kind: ArtifactKind, ext: string): string {
  if (ext) return ext;
  return extensionFor('', kind);
}

/**
 * Build an artifact record from a `Write` tool_use. Used by the artifact
 * store's `ingestToolUse` path — every file that Claude writes becomes a
 * first-class gallery entry keyed by its absolute path, so multiple Writes to
 * the same file collapse to one artifact (latest content wins) and Edits are
 * applied on top.
 *
 * Returns `null` for non-Write tools or tools without a usable `file_path`.
 */
export function artifactFromWrite(
  tool: ToolUseLike,
  ctx: ToolUseContext,
): ExtractedArtifact | null {
  if (tool.name !== 'Write') return null;
  if (!tool.input || typeof tool.input !== 'object') return null;
  const input = tool.input as Record<string, unknown>;
  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  if (!filePath) return null;
  const content = typeof input.content === 'string' ? input.content : '';

  const kind = classifyByPath(filePath);
  const now = ctx.now ?? Date.now();
  const ext = (() => {
    const dot = filePath.lastIndexOf('.');
    return dot > 0 ? filePath.slice(dot + 1).toLowerCase() : '';
  })();
  // Binary kinds (pdf/docx/xlsx/pptx/image) cannot be stored inline — the
  // file bytes live on disk and the previewer fetches them via /api/files/raw
  // using `filePath`. Text kinds are snapshotted inline so they survive a
  // project switch.
  const binary = isBinaryKind(kind);

  return {
    id: stableIdFor(filePath),
    messageId: ctx.messageId,
    sessionId: ctx.sessionId,
    index: 0,
    language: languageFromKind(kind, ext),
    kind,
    title: titleFromPath(filePath),
    content: binary ? '' : content,
    filePath,
    byteSize: binary ? undefined : content.length,
    source: binary ? 'file' : 'inline',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Apply an `Edit` / `MultiEdit` tool_use against an existing artifact (looked
 * up by file path). Returns an updated artifact when the baseline is known
 * and the edit applied cleanly; otherwise returns `null` so the caller can
 * fall back to reading the on-disk baseline and retrying.
 */
export function artifactFromEdit(
  tool: ToolUseLike,
  ctx: ToolUseContext,
  existing: ExtractedArtifact | null,
): ExtractedArtifact | null {
  if (tool.name !== 'Edit' && tool.name !== 'MultiEdit') return null;
  if (!tool.input || typeof tool.input !== 'object') return null;
  const input = tool.input as Record<string, unknown>;
  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  if (!filePath) return null;

  const ops = extractEditOps(input);
  if (ops.length === 0) return null;

  // Edits against binary files cannot be previewed (the tool doesn't carry
  // byte content); we only refresh the `updatedAt` marker so the list shows
  // the file moved to the top of the "just edited" ordering.
  if (existing && existing.source === 'file') {
    return { ...existing, updatedAt: ctx.now ?? Date.now() };
  }

  if (!existing || existing.source !== 'inline') return null;
  const nextContent = applyEditOps(existing.content, ops);
  if (nextContent === existing.content) {
    return { ...existing, updatedAt: ctx.now ?? Date.now() };
  }
  return {
    ...existing,
    content: nextContent,
    byteSize: nextContent.length,
    updatedAt: ctx.now ?? Date.now(),
  };
}
