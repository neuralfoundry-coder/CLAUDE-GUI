'use client';

import { useCallback, type SyntheticEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';

interface MarkdownPreviewProps {
  content: string;
}

function MarkdownImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const onError = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none';
  }, []);

  return <img {...props} onError={onError} />;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div className="h-full w-full bg-muted p-2">
      <div className="scrollbar-thin h-full overflow-y-auto rounded-sm bg-background p-6 shadow-sm ring-1 ring-border/70">
        <article className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeSanitize, rehypeHighlight, rehypeKatex]}
            components={{ img: MarkdownImage }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
