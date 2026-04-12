'use client';

import { useMemo } from 'react';
import hljs from 'highlight.js/lib/core';
import xml from 'highlight.js/lib/languages/xml';
import markdownLang from 'highlight.js/lib/languages/markdown';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';

if (!hljs.getLanguage('xml')) hljs.registerLanguage('xml', xml);
if (!hljs.getLanguage('markdown')) hljs.registerLanguage('markdown', markdownLang);
if (!hljs.getLanguage('javascript')) hljs.registerLanguage('javascript', javascript);
if (!hljs.getLanguage('typescript')) hljs.registerLanguage('typescript', typescript);
if (!hljs.getLanguage('python')) hljs.registerLanguage('python', python);
if (!hljs.getLanguage('css')) hljs.registerLanguage('css', css);
if (!hljs.getLanguage('json')) hljs.registerLanguage('json', json);
if (!hljs.getLanguage('bash')) hljs.registerLanguage('bash', bash);
if (!hljs.getLanguage('yaml')) hljs.registerLanguage('yaml', yaml);
if (!hljs.getLanguage('sql')) hljs.registerLanguage('sql', sql);

/** Map common language identifiers to hljs language names. */
const LANG_MAP: Record<string, string> = {
  html: 'xml', htm: 'xml', xhtml: 'xml', svg: 'xml', xml: 'xml',
  markdown: 'markdown', md: 'markdown', mdx: 'markdown',
  javascript: 'javascript', js: 'javascript', jsx: 'javascript',
  typescript: 'typescript', ts: 'typescript', tsx: 'typescript',
  python: 'python', py: 'python',
  css: 'css', scss: 'css',
  json: 'json',
  bash: 'bash', sh: 'bash', shell: 'bash', zsh: 'bash',
  yaml: 'yaml', yml: 'yaml',
  sql: 'sql',
};

interface SourcePreviewProps {
  content: string;
  language: string;
}

export function SourcePreview({ content, language }: SourcePreviewProps) {
  const hlLang = LANG_MAP[language.toLowerCase()] ?? null;

  const highlighted = useMemo(() => {
    if (!content) return '';
    if (hlLang && hljs.getLanguage(hlLang)) {
      return hljs.highlight(content, { language: hlLang, ignoreIllegals: true }).value;
    }
    // Auto-detect for unknown languages
    return hljs.highlightAuto(content).value;
  }, [content, hlLang]);

  return (
    <div className="h-full w-full bg-muted p-2">
      <pre className="scrollbar-thin h-full overflow-auto rounded-sm bg-background p-3 font-mono text-xs shadow-sm ring-1 ring-border/70">
        {content ? (
          <code
            className={`hljs${hlLang ? ` language-${hlLang}` : ''}`}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <code className="text-muted-foreground">(empty)</code>
        )}
      </pre>
    </div>
  );
}
