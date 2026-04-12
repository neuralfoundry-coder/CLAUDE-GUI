'use client';

import { memo, useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, Shield, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/stores/use-claude-store';

interface ChatMessageItemProps {
  message: ChatMessage;
}

function ToolUseMessage({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);
  const inputStr = message.toolInput
    ? JSON.stringify(message.toolInput, null, 2)
    : message.content;

  return (
    <div className="rounded-md border border-accent bg-accent/30">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {message.isStreaming ? (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        ) : expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="font-mono text-[10px] font-semibold uppercase text-muted-foreground">
          {message.toolName ?? 'tool'}
        </span>
        {message.isStreaming && (
          <span className="text-[10px] text-muted-foreground/70">
            {message.content}
          </span>
        )}
      </button>
      {expanded && !message.isStreaming && (
        <pre className="max-h-60 overflow-auto border-t border-accent/50 px-3 py-2 text-[10px] font-mono text-muted-foreground">
          {inputStr}
        </pre>
      )}
    </div>
  );
}

function AutoDecisionMessage({ message }: { message: ChatMessage }) {
  const isAllow = message.content.startsWith('Auto-allowed');
  return (
    <div className="flex items-center justify-center gap-1.5 py-0.5">
      <Shield
        className={cn('h-3 w-3', isAllow ? 'text-green-500' : 'text-red-400')}
        aria-hidden="true"
      />
      <span
        className={cn(
          'text-[10px]',
          isAllow ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400',
        )}
      >
        {message.content}
      </span>
    </div>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-0.5">
      <Bot className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      <span className="text-[10px] text-muted-foreground">{message.content}</span>
    </div>
  );
}

function ErrorMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="whitespace-pre-wrap break-words text-xs text-destructive">
        {message.content}
      </div>
    </div>
  );
}

function AssistantTextMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2">
      <div className="prose prose-xs dark:prose-invert max-w-none text-xs [&_pre]:text-[10px] [&_code]:text-[10px]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
      {message.isStreaming && (
        <span className="inline-block h-3 w-1.5 animate-pulse bg-foreground/70 align-middle" />
      )}
    </div>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="rounded-md bg-primary/10 px-3 py-2">
      <div className="whitespace-pre-wrap break-words text-xs">{message.content}</div>
    </div>
  );
}

export const ChatMessageItem = memo(function ChatMessageItem({ message }: ChatMessageItemProps) {
  if (message.role === 'user') {
    return <UserMessage message={message} />;
  }

  switch (message.kind) {
    case 'tool_use':
      return <ToolUseMessage message={message} />;
    case 'auto_decision':
      return <AutoDecisionMessage message={message} />;
    case 'system':
      return <SystemMessage message={message} />;
    case 'error':
      return <ErrorMessage message={message} />;
    case 'text':
    default:
      return <AssistantTextMessage message={message} />;
  }
}, (prev, next) => (
  prev.message.id === next.message.id &&
  prev.message.content === next.message.content &&
  prev.message.isStreaming === next.message.isStreaming
));
