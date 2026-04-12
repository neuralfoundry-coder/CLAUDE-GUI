'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Send, Square, History, Plus, FileStack } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClaudeStore } from '@/stores/use-claude-store';
import { useArtifactStore } from '@/stores/use-artifact-store';
import { getClaudeClient } from '@/lib/websocket/claude-client';
import type { ProjectFileItem } from '@/lib/fs/list-project-files';
import { SessionList } from './session-list';
import { SessionInfoBar } from './session-info-bar';
import { ChatFilterBar } from './chat-filter-bar';
import { ChatMessageItem } from './chat-message-item';
import { ModelSelector } from './model-selector';
import {
  detectMention,
  filterMentionCandidates,
  useFileMentions,
} from './use-file-mentions';
import { MentionPopover } from './mention-popover';
import { detectIntent } from '@/lib/claude/intent-detector';
import { SlidePreferencesDialog } from './slide-preferences-dialog';
import type { SlidePreferences } from '@/types/intent';
import {
  detectSlashCommand,
  filterSlashCommands,
  resolveSlashCommand,
  type SlashCommand,
} from '@/lib/claude/slash-commands';
import { SlashCommandPopover } from './slash-command-popover';
import { useSettingsStore } from '@/stores/use-settings-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { findModelSpec } from '@/lib/claude/model-specs';
import { useChatDrop } from './use-chat-drop';
import { DropOverlay } from './drop-overlay';
import { AttachedFilesBar } from './attached-files-bar';

export function ClaudeChatPanel() {
  const [input, setInput] = useState('');
  const [sessionListOpen, setSessionListOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showSlideDialog, setShowSlideDialog] = useState(false);
  const [pendingSlidePrompt, setPendingSlidePrompt] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const messages = useClaudeStore((s) => s.messages);
  const messageFilter = useClaudeStore((s) => s.messageFilter);
  const isStreaming = useClaudeStore((s) => s.isStreaming);
  const reset = useClaudeStore((s) => s.reset);

  const filteredMessages = useMemo(
    () => messages.filter((m) => m.role === 'user' || messageFilter.has(m.kind)),
    [messages, messageFilter],
  );
  const artifactCount = useArtifactStore((s) => s.artifacts.length);
  const openArtifacts = useArtifactStore((s) => s.open);
  const activeTabPath = useEditorStore((s) => {
    if (!s.activeTabId) return null;
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.path ?? null;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { entries: mentionEntries } = useFileMentions();

  const insertReferences = useCallback((paths: string[]) => {
    const refs = paths.map((p) => `@${p}`).join(' ');
    setInput((prev) => {
      const needsSpace = prev.length > 0 && !prev.endsWith(' ') && !prev.endsWith('\n');
      return (needsSpace ? prev + ' ' : prev) + refs + ' ';
    });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const {
    pendingFiles,
    uploading,
    isDragOver,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onPaste,
    removePendingFile,
    clearPending,
  } = useChatDrop({ insertReferences });

  const mentionCandidates = useMemo(() => {
    if (mentionStart === null) return [];
    return filterMentionCandidates(mentionEntries, mentionQuery);
  }, [mentionStart, mentionQuery, mentionEntries]);

  const mentionOpen = mentionStart !== null && mentionCandidates.length > 0;

  const slashCandidates = useMemo(() => {
    if (slashQuery === null) return [];
    return filterSlashCommands(slashQuery);
  }, [slashQuery]);
  const slashOpen = slashQuery !== null && slashCandidates.length > 0;

  useEffect(() => {
    if (slashIndex >= slashCandidates.length) {
      setSlashIndex(0);
    }
  }, [slashCandidates.length, slashIndex]);

  const closeSlash = () => {
    setSlashQuery(null);
    setSlashIndex(0);
  };

  const pushSystemMessage = useCallback((content: string) => {
    useClaudeStore.setState((s) => ({
      messages: [
        ...s.messages,
        {
          id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'system' as const,
          kind: 'system' as const,
          content,
          timestamp: Date.now(),
        },
      ],
    }));
  }, []);

  const executeSlashCommand = useCallback(
    (cmd: SlashCommand, fullInput: string) => {
      if (cmd.handler === 'passthrough') {
        // Commands like /compact and /context require an existing session
        const sid = useClaudeStore.getState().activeSessionId;
        if (!sid) {
          pushSystemMessage(
            `\`${cmd.name}\` requires an active session. Send a message first to start a conversation.`,
          );
          return;
        }
        getClaudeClient().sendQuery(fullInput);
        return;
      }

      // Client-side commands
      switch (cmd.name) {
        case '/clear':
        case '/new': {
          reset();
          break;
        }
        case '/help': {
          const lines = [
            '**Available slash commands:**',
            '',
            '| Command | Description |',
            '|---------|-------------|',
            '| `/clear` | Clear chat and start fresh |',
            '| `/new` | Start a new Claude session |',
            '| `/compact` | Compact conversation context |',
            '| `/usage` | Show token usage and cost |',
            '| `/context` | Show context window usage |',
            '| `/cost` | Show session cost breakdown |',
            '| `/model` | Show current model info |',
            '| `/plan` | Ask Claude to create a plan |',
            '| `/review` | Ask Claude to review changes |',
            '| `/help` | Show this help message |',
            '',
            'Type `@` to reference files. Use `Cmd+K` for the command palette.',
          ];
          pushSystemMessage(lines.join('\n'));
          break;
        }
        case '/usage': {
          const sid = useClaudeStore.getState().activeSessionId;
          const stats = sid ? useClaudeStore.getState().sessionStats[sid] : null;
          const fmt = (n: number) =>
            n >= 1_000_000
              ? `${(n / 1_000_000).toFixed(1)}M`
              : n >= 1_000
                ? `${(n / 1_000).toFixed(1)}k`
                : String(n);
          if (!stats) {
            const lines = [
              '**Token Usage**',
              '',
              '- **Input tokens:** 0',
              '- **Output tokens:** 0',
              '- **Cache read:** 0',
              '- **Total tokens:** 0',
              '- **Turns:** -',
              '',
              '_No conversation yet. Send a message to start tracking usage._',
            ];
            pushSystemMessage(lines.join('\n'));
            break;
          }
          const lines = [
            `**Token Usage** (session \`${sid?.slice(0, 8)}…\`)`,
            '',
            `- **Input tokens:** ${fmt(stats.inputTokens)}`,
            `- **Output tokens:** ${fmt(stats.outputTokens)}`,
            `- **Cache read:** ${fmt(stats.cacheReadTokens)}`,
            `- **Total tokens:** ${fmt(stats.inputTokens + stats.outputTokens)}`,
            `- **Turns:** ${stats.numTurns ?? '-'}`,
          ];
          pushSystemMessage(lines.join('\n'));
          break;
        }
        case '/cost': {
          const sid = useClaudeStore.getState().activeSessionId;
          const stats = sid ? useClaudeStore.getState().sessionStats[sid] : null;
          const totalCost = useClaudeStore.getState().totalCost;
          const lines = [
            '**Cost Summary**',
            '',
            `- **Session cost:** $${(stats?.costUsd ?? 0).toFixed(4)}`,
            `- **Total cost (all sessions):** $${totalCost.toFixed(4)}`,
          ];
          pushSystemMessage(lines.join('\n'));
          break;
        }
        case '/model': {
          const sid = useClaudeStore.getState().activeSessionId;
          const stats = sid ? useClaudeStore.getState().sessionStats[sid] : null;
          const selectedModel = useSettingsStore.getState().selectedModel;
          const modelId = stats?.model ?? selectedModel ?? 'auto';
          const spec = findModelSpec(modelId);
          const lines = [
            `**Current Model:** \`${modelId}\``,
            '',
          ];
          if (spec) {
            lines.push(
              `- **Context window:** ${(spec.contextWindow / 1000)}k tokens`,
              `- **Max output:** ${(spec.maxOutput / 1000)}k tokens`,
              `- **Price:** $${spec.inputPricePer1M}/M input, $${spec.outputPricePer1M}/M output`,
            );
            if (spec.capabilities.length > 0) {
              lines.push(`- **Capabilities:** ${spec.capabilities.join(', ')}`);
            }
          }
          lines.push('', 'Use the model selector in the header to change models.');
          pushSystemMessage(lines.join('\n'));
          break;
        }
        default:
          pushSystemMessage(`Unknown command: ${cmd.name}`);
      }
    },
    [reset, pushSystemMessage],
  );

  // Track whether the user has scrolled away from the bottom so we can
  // auto-scroll only when they are near the end.
  const stickToBottom = useRef(true);

  const virtualizer = useVirtualizer({
    count: filteredMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  // Auto-scroll to bottom when new messages arrive (only if user is near the bottom).
  useEffect(() => {
    if (!stickToBottom.current || filteredMessages.length === 0) return;
    // Use requestAnimationFrame so the DOM has time to paint the new items
    // before we measure and scroll.
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(filteredMessages.length - 1, { align: 'end' });
    });
  }, [filteredMessages.length, virtualizer]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "at bottom" when within 80px of the end.
    stickToBottom.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
  }, []);

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
    // Slash command detection (only at start of input)
    const sq = detectSlashCommand(value);
    if (sq !== null) {
      setSlashQuery(sq);
    } else {
      closeSlash();
    }
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

  const acceptSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      setInput('');
      closeSlash();
      closeMention();
      executeSlashCommand(cmd, cmd.name);
    },
    [executeSlashCommand],
  );

  const onStop = useCallback(() => {
    const reqId = useClaudeStore.getState().currentRequestId;
    if (reqId) {
      getClaudeClient().abort(reqId);
    }
    useClaudeStore.getState().setStreaming(false);
    useClaudeStore.getState().setCurrentRequestId(null);
  }, []);

  const onSend = () => {
    if (!input.trim() || isStreaming) return;
    const trimmed = input.trim();

    // Check if it's a slash command
    const cmd = resolveSlashCommand(trimmed);
    if (cmd) {
      setInput('');
      closeSlash();
      closeMention();
      executeSlashCommand(cmd, trimmed);
      return;
    }

    const intent = detectIntent(trimmed);
    if (intent === 'slides') {
      setPendingSlidePrompt(trimmed);
      setShowSlideDialog(true);
      setInput('');
      closeMention();
      return;
    }
    getClaudeClient().sendQuery(trimmed);
    setInput('');
    closeMention();
    closeSlash();
    clearPending();
  };

  const handleSlideSubmit = (preferences: SlidePreferences) => {
    if (!pendingSlidePrompt) return;
    getClaudeClient().sendQuery(pendingSlidePrompt, {
      type: 'slides',
      preferences: preferences as unknown as Record<string, unknown>,
    });
    setShowSlideDialog(false);
    setPendingSlidePrompt(null);
  };

  const handleSlideSkip = () => {
    if (!pendingSlidePrompt) return;
    getClaudeClient().sendQuery(pendingSlidePrompt, {
      type: 'slides',
      preferences: { purpose: '일반', textSize: 'medium', colorTone: 'deep-navy' },
    });
    setShowSlideDialog(false);
    setPendingSlidePrompt(null);
  };

  const handleSlideCancel = () => {
    if (pendingSlidePrompt) setInput(pendingSlidePrompt);
    setShowSlideDialog(false);
    setPendingSlidePrompt(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // While an IME composition is active (Korean/Japanese/Chinese), the first
    // Enter commits the composition. Treating it as submit would send the
    // text without the last composing char and leave that char in the box.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (slashOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashCandidates.length) % slashCandidates.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const chosen = slashCandidates[slashIndex];
        if (chosen) {
          // Fill the input with the command name so the user can add args or just press Enter
          setInput(chosen.name + ' ');
          closeSlash();
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const chosen = slashCandidates[slashIndex];
        if (chosen) acceptSlashCommand(chosen);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSlash();
        return;
      }
    }
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
    setTimeout(() => {
      closeMention();
      closeSlash();
    }, 150);
  };

  return (
    <div
      className={`relative flex h-full flex-col border-l bg-background${isStreaming ? ' claude-streaming' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <DropOverlay visible={isDragOver} />
      <div className="flex h-7 items-center justify-between border-b bg-muted px-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Claude</span>
          <ModelSelector />
        </div>
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

      <ChatFilterBar />

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin flex-1 overflow-y-auto text-sm"
      >
        {filteredMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
            Ask Claude to edit files, write code, or create presentations. Type / for commands.
          </div>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const m = filteredMessages[virtualRow.index]!;
              return (
                <div
                  key={m.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="px-3 py-1.5">
                    <ChatMessageItem message={m} />
                  </div>
                </div>
              );
            })}
            {isStreaming && !messages.some((m) => m.isStreaming) && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualizer.getTotalSize()}px)`,
                }}
              >
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <span className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                  </span>
                  Claude is thinking...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <SessionInfoBar />

      <AttachedFilesBar files={pendingFiles} onRemove={removePendingFile} />

      {activeTabPath && (
        <div className="flex items-center gap-1 border-t px-2 py-0.5 text-[10px] text-muted-foreground">
          <span className="shrink-0">Focusing:</span>
          <span className="truncate font-mono" title={activeTabPath}>
            {activeTabPath}
          </span>
        </div>
      )}

      <div className="border-t p-2">
        <div className="flex items-start gap-2">
          <div className="relative flex-1">
            {slashOpen && !mentionOpen && (
              <SlashCommandPopover
                commands={slashCandidates}
                activeIndex={slashIndex}
                onSelect={acceptSlashCommand}
                onHover={setSlashIndex}
              />
            )}
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
              onPaste={onPaste}
              placeholder="Ask Claude... (@ files, / commands, drop files)"
              aria-label="Claude prompt input"
              aria-autocomplete="list"
              aria-expanded={mentionOpen || slashOpen}
              rows={2}
              className="w-full resize-none rounded-md border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {isStreaming ? (
            <Button
              size="icon"
              variant="destructive"
              onClick={onStop}
              aria-label="Stop generation"
            >
              <Square className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={onSend}
              disabled={uploading || !input.trim()}
              aria-label="Send prompt"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <SessionList open={sessionListOpen} onOpenChange={setSessionListOpen} />

      <SlidePreferencesDialog
        open={showSlideDialog}
        onSubmit={handleSlideSubmit}
        onSkip={handleSlideSkip}
        onCancel={handleSlideCancel}
      />
    </div>
  );
}
