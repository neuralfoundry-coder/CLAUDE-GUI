export type ArtifactKind = 'html' | 'svg' | 'markdown' | 'code' | 'text';

export interface ExtractedArtifact {
  id: string;
  messageId: string;
  sessionId: string | null;
  index: number;
  language: string;
  kind: ArtifactKind;
  title: string;
  content: string;
  createdAt: number;
}

const FENCE_RE = /```([a-zA-Z0-9+._-]*)\n([\s\S]*?)```/g;
const RAW_SVG_RE = /<svg\b[^>]*>[\s\S]*?<\/svg>/gi;
const RAW_HTML_DOC_RE = /<!doctype html[\s\S]*?<\/html>/gi;

const MARKDOWN_LANGS = new Set(['md', 'markdown', 'mdx']);
const HTML_LANGS = new Set(['html', 'htm', 'xhtml']);
const SVG_LANGS = new Set(['svg']);

const MIN_BLOCK_LENGTH = 24;

function classify(language: string, content: string): ArtifactKind {
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

function titleFor(kind: ArtifactKind, language: string, content: string, fallback: string): string {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const first = lines[0] ?? '';
  if (kind === 'markdown') {
    const heading = lines.find((l) => l.startsWith('#'));
    if (heading) return heading.replace(/^#+\s*/, '').slice(0, 80);
  }
  if (kind === 'html' || kind === 'svg') {
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) return titleMatch[1].trim().slice(0, 80);
  }
  const commentMatch = first.match(/^(?:\/\/|#|--|<!--)\s*(.+?)(?:-->)?\s*$/);
  if (commentMatch && commentMatch[1] && commentMatch[1].length > 3) {
    return commentMatch[1].slice(0, 80);
  }
  if (language) return `${language} snippet ${fallback}`;
  return `Snippet ${fallback}`;
}

export function extensionFor(language: string, kind: ArtifactKind): string {
  const lang = language.toLowerCase();
  const table: Record<string, string> = {
    typescript: 'ts',
    ts: 'ts',
    tsx: 'tsx',
    javascript: 'js',
    js: 'js',
    jsx: 'jsx',
    python: 'py',
    py: 'py',
    rust: 'rs',
    rs: 'rs',
    go: 'go',
    java: 'java',
    kotlin: 'kt',
    swift: 'swift',
    ruby: 'rb',
    rb: 'rb',
    php: 'php',
    bash: 'sh',
    sh: 'sh',
    zsh: 'sh',
    shell: 'sh',
    yaml: 'yaml',
    yml: 'yml',
    toml: 'toml',
    json: 'json',
    css: 'css',
    scss: 'scss',
    sql: 'sql',
    html: 'html',
    htm: 'html',
    xhtml: 'html',
    svg: 'svg',
    md: 'md',
    markdown: 'md',
    mdx: 'mdx',
    c: 'c',
    cpp: 'cpp',
    'c++': 'cpp',
    'c#': 'cs',
    cs: 'cs',
    csharp: 'cs',
  };
  if (table[lang]) return table[lang];
  if (kind === 'html') return 'html';
  if (kind === 'svg') return 'svg';
  if (kind === 'markdown') return 'md';
  return 'txt';
}

interface ExtractOptions {
  messageId: string;
  sessionId: string | null;
  now?: number;
}

export function extractArtifacts(
  text: string,
  { messageId, sessionId, now = Date.now() }: ExtractOptions,
): ExtractedArtifact[] {
  if (!text) return [];
  const results: ExtractedArtifact[] = [];
  const consumedRanges: Array<[number, number]> = [];

  let match: RegExpExecArray | null;
  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(text)) !== null) {
    const rawLang = (match[1] ?? '').trim();
    const body = (match[2] ?? '').replace(/\s+$/, '');
    if (body.length < MIN_BLOCK_LENGTH) continue;
    const kind = classify(rawLang, body);
    const index = results.length + 1;
    results.push({
      id: `${messageId}:${index}`,
      messageId,
      sessionId,
      index,
      language: rawLang || kind,
      kind,
      title: titleFor(kind, rawLang, body, String(index)),
      content: body,
      createdAt: now,
    });
    consumedRanges.push([match.index, match.index + match[0].length]);
  }

  function insideFence(pos: number, end: number): boolean {
    for (const [s, e] of consumedRanges) {
      if (pos >= s && end <= e) return true;
    }
    return false;
  }

  RAW_HTML_DOC_RE.lastIndex = 0;
  while ((match = RAW_HTML_DOC_RE.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (insideFence(start, end)) continue;
    const body = match[0];
    if (body.length < MIN_BLOCK_LENGTH) continue;
    const index = results.length + 1;
    results.push({
      id: `${messageId}:${index}`,
      messageId,
      sessionId,
      index,
      language: 'html',
      kind: 'html',
      title: titleFor('html', 'html', body, String(index)),
      content: body,
      createdAt: now,
    });
  }

  RAW_SVG_RE.lastIndex = 0;
  while ((match = RAW_SVG_RE.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (insideFence(start, end)) continue;
    const body = match[0];
    if (body.length < MIN_BLOCK_LENGTH) continue;
    const index = results.length + 1;
    results.push({
      id: `${messageId}:${index}`,
      messageId,
      sessionId,
      index,
      language: 'svg',
      kind: 'svg',
      title: titleFor('svg', 'svg', body, String(index)),
      content: body,
      createdAt: now,
    });
  }

  return results;
}
