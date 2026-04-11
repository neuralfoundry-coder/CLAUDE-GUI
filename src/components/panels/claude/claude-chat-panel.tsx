'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Square, History, Plus, FileStack } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useClaudeStore } from '@/stores/use-claude-store';
import { useArtifactStore } from '@/stores/use-artifact-store';
import { getClaudeClient } from '@/lib/websocket/claude-client';
import type { ProjectFileItem } from '@/lib/fs/list-project-files';
import { SessionList } from './session-list';
import { SessionInfoBar } from './session-info-bar';
import {
  detectMention,
  filterMentionCandidates,
  useFileMentions,
} from './use-file-mentions';
import { MentionPopover } from './mention-popover';

export function ClaudeChatPanel() {
  const [input, setInput] = useState('');
  const [sessionListOpen, setSessionListOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const messages = useClaudeStore((s) => s.messages);
  const isStreaming = useClaudeStore((s) => s.isStreaming);
  const reset = useClaudeStore((s) => s.reset);
  const artifactCount = useArtifactStore((s) => s.artifacts.length);
  const openArtifacts = useArtifactStore((s) => s.open);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { entries: mentionEntries } = useFileMentions();

  const mentionCandidates = useMemo(() => {
    if (mentionStart === null) return [];
    return filterMentionCandidates(mentionEntries, mentionQuery);
  }, [mentionStart, mentionQuery, mentionEntries]);

  const mentionOpen = mentionStart !== null && mentionCandidates.length > 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (mentionIndex >= mentionCandidates.length) {
      setMentionIndex(0);
    }
  }, [mentionCandidates.length, mentionIndex]);

  const closeMention = () => {
    setMentionStart(null);
    setMentionQuery('');
    setMentionIndex(0);
  };

  const syncMentionFromCursor = (value: string, cursor: number) => {
    const match = detectMention(value, cursor);
    if (match) {
      setMentionStart(match.start);
      setMentionQuery(match.query);
    } else {
      closeMention();
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setInput(value);
    syncMentionFromCursor(value, cursor);
  };

  const acceptMention = (item: ProjectFileItem) => {
    if (mentionStart === null) return;
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? mentionStart + mentionQuery.length + 1;
    const before = input.slice(0, mentionStart);
    const after = input.slice(cursor);
    const token = `@${item.path}${item.type === 'directory' ? '/' : ''}`;
    const needsSpace = after.length === 0 || !/^\s/.test(after);
    const insertion = needsSpace ? `${token} ` : token;
    const next = `${before}${insertion}${after}`;
    const nextCursor = before.length + insertion.length;
    setInput(next);
    closeMention();
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const onSend = () => {
    if (!input.trim() || isStreaming) return;
    getClaudeClient().sendQuery(input.trim());
    setInput('');
    closeMention();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const chosen = mentionCandidates[mentionIndex];
        if (chosen) acceptMention(chosen);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMention();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const onSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const node = e.currentTarget;
    syncMentionFromCursor(node.value, node.selectionStart ?? node.value.length);
  };

  const onBlur = () => {
    setTimeout(closeMention, 150);
  };

  return (
    <div className="flex h-full flex-col border-l bg-background">
      <div className="flex h-7 items-center justify-between border-b bg-muted px-2">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Claude</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="relative h-6 w-6"
            onClick={() => openArtifacts()}
            title="Generated content"
            aria-label="Open generated content gallery"
          >
            <FileStack className="h-3 w-3" aria-hidden="true" />
            {artifactCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary px-1 text-[8px] font-semibold leading-none text-primary-foreground"
                aria-label={`${artifactCount} artifacts`}
              >
                {artifactCount > 99 ? '99+' : artifactCount}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => reset()}
            title="New session"
            aria-label="New Claude session"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setSessionListOpen(true)}
            title="Session history"
            aria-label="Open Claude session history"
          >
            <History className="h-3 w-3" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto p-3 text-sm">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">
            Ask Claude to edit files, write code, or create presentations.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'rounded-md px-3 py-2 text-xs',
                  m.role === 'user' && 'bg-primary/10',
                  m.role === 'assistant' && 'bg-muted',
                  m.role === 'tool' && 'border border-accent bg-accent/30',
                )}
              >
                {m.role === 'tool' && (
                  <div className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">
                    Tool: {m.toolName}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SessionInfoBar />

      <div className="border-t p-2">
        <div className="flex items-start gap-2">
          <div className="relative flex-1">
            {mentionOpen && (
              <MentionPopover
                items={mentionCandidates}
                activeIndex={mentionIndex}
                onSelect={acceptMention}
                onHover={setMentionIndex}
              />
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onSelect={onSelect}
              onBlur={onBlur}
              placeholder="Ask Claude... (type @ to reference a file)"
              aria-label="Claude prompt input"
              aria-autocomplete="list"
              aria-expanded={mentionOpen}
              rows={2}
              className="w-full resize-none rounded-md border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button
            size="icon"
            onClick={onSend}
            disabled={isStreaming || !input.trim()}
            aria-label={isStreaming ? 'Stop' : 'Send prompt'}
          >
            {isStreaming ? (
              <Square className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      <SessionList open={sessionListOpen} onOpenChange={setSessionListOpen} />
    </div>
  );
}
