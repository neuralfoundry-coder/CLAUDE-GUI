'use client';

import { useMemo } from 'react';
import hljs from 'highlight.js/lib/core';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';

if (!hljs.getLanguage('xml')) hljs.registerLanguage('xml', xml);
if (!hljs.getLanguage('markdown')) hljs.registerLanguage('markdown', markdown);

export type SourceLanguage = 'html' | 'markdown';

interface SourcePreviewProps {
  content: string;
  language: SourceLanguage;
}

export function SourcePreview({ content, language }: SourcePreviewProps) {
  const html = useMemo(() => {
    if (!content) return '';
    const hlLang = language === 'html' ? 'xml' : 'markdown';
    return hljs.highlight(content, { language: hlLang, ignoreIllegals: true }).value;
  }, [content, language]);

  return (
    <div className="h-full w-full bg-muted p-2">
      <pre className="scrollbar-thin h-full overflow-auto rounded-sm bg-background p-3 font-mono text-xs shadow-sm ring-1 ring-border/70">
        {content ? (
          <code
            className={`hljs language-${language === 'html' ? 'xml' : 'markdown'}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <code className="text-muted-foreground">(empty)</code>
        )}
      </pre>
    </div>
  );
}
