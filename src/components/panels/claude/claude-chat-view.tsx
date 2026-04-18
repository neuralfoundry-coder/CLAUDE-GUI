'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClaudeStore } from '@/stores/use-claude-store';
import { useShallow } from 'zustand/react/shallow';
import { getClaudeClient } from '@/lib/websocket/claude-client';
import type { ProjectFileItem } from '@/lib/fs/list-project-files';
import { SessionInfoBar } from './session-info-bar';
import { ChatFilterBar } from './chat-filter-bar';
import { ChatMessageItem } from './chat-message-item';
import {
  detectMention,
  filterMentionCandidates,
  useFileMentions,
} from './use-file-mentions';
import { MentionPopover } from './mention-popover';
import { detectIntent } from '@/lib/claude/intent-detector';
import {
  SLASH_COMMANDS,
  detectSlashCommand,
  filterSlashCommands,
  resolveSlashCommand,
  getCategoryLabel,
  type SlashCommand,
} from '@/lib/claude/slash-commands';
import { SlashCommandPopover } from './slash-command-popover';
import { useSettingsStore } from '@/stores/use-settings-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { findModelSpec } from '@/lib/claude/model-specs';
import {
  handleBug,
  handleConfig,
  handleDoctor,
  handleLogin,
  handleLogout,
  handleStatus,
  handleVim,
  handleTerminalSetup,
  handlePermissions,
  handleApprovedTools,
  handleMcp,
  handleMemory,
  handleAddDir,
} from '@/lib/claude/slash-command-handlers';
import { useChatDrop } from './use-chat-drop';
import { DropOverlay } from './drop-overlay';
import { AttachedFilesBar } from './attached-files-bar';
import { useLayoutStore } from '@/stores/use-layout-store';
import type { ChatMessage } from '@/stores/use-claude-store';

const STREAMING_ACTIVITY_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

interface StreamingEditToolSummary {
  toolName: string;
  filePath: string | undefined;
}

function selectStreamingEditTool(messages: ChatMessage[]): StreamingEditToolSummary | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.kind === 'tool_use' && m.isStreaming && STREAMING_ACTIVITY_TOOLS.has(m.toolName ?? '')) {
      const input = m.toolInput as Record<string, unknown> | undefined;
      const filePath = input?.file_path as string | undefined;
      return { toolName: m.toolName!, filePath };
    }
  }
  return null;
}

function StreamingActivityBar({ tabId }: { tabId: string }) {
  // Subscribe directly to the store with a shallow-equal selector. This way
  // the bar only re-renders when toolName or filePath actually changes —
  // not on every token delta that reshapes the messages array.
  const lastEditTool = useClaudeStore(
    useShallow((s) => {
      const summary = selectStreamingEditTool(s.tabStates[tabId]?.messages ?? []);
      return summary ?? { toolName: null as string | null, filePath: undefined as string | undefined };
    }),
  );

  if (!lastEditTool.toolName) return null;

  const fileName = lastEditTool.filePath?.split('/').pop();
  const label = lastEditTool.toolName === 'Write'
    ? `Writing ${fileName ?? 'file'}...`
    : `Editing ${fileName ?? 'file'}...`;
  const filePathForTitle = lastEditTool.filePath ?? '';

  return (
    <div className="flex items-center gap-1.5 border-t px-2 py-0.5 text-[10px] text-muted-foreground">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
      <span className="truncate font-mono" title={filePathForTitle}>
        {label}
      </span>
    </div>
  );
}

interface ClaudeChatViewProps {
  tabId: string;
  onShowSlideDialog: (prompt: string) => void;
}

export function ClaudeChatView({ tabId, onShowSlideDialog }: ClaudeChatViewProps) {
  const [input, setInput] = useState('');
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);

  // Read from tab-specific state
  const messages = useClaudeStore((s) => s.tabStates[tabId]?.messages ?? []);
  const messageFilter = useClaudeStore((s) => s.tabStates[tabId]?.messageFilter ?? new Set());
  const isStreaming = useClaudeStore((s) => s.tabStates[tabId]?.isStreaming ?? false);
  const resetActiveTab = useClaudeStore((s) => s.resetActiveTab);
  const createTab = useClaudeStore((s) => s.createTab);

  const filteredMessages = useMemo(
    () => messages.filter((m) => m.role === 'user' || messageFilter.has(m.kind)),
    [messages, messageFilter],
  );

  const activeTabPath = useEditorStore((s) => {
    if (!s.activeTabId) return null;
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.path ?? null;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { entries: mentionEntries } = useFileMentions();
  const claudeZoom = useLayoutStore((s) => s.panelZoom.claude);

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

  /** Push a system message into the active tab's messages. */
  const pushSystemMessage = useCallback((content: string) => {
    useClaudeStore.setState((s) => {
      const tid = s.activeTabId;
      if (!tid) return s;
      const ts = s.tabStates[tid];
      if (!ts) return s;
      const msg: ChatMessage = {
        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'system',
        kind: 'system',
        content,
        timestamp: Date.now(),
      };
      const nextTs = { ...ts, messages: [...ts.messages, msg] };
      return {
        tabStates: { ...s.tabStates, [tid]: nextTs },
        // Backward compat: mirror to top-level if active tab
        messages: nextTs.messages,
      };
    });
  }, []);

  /** Get the active tab's sessionId (for slash commands that need it). */
  const getActiveSessionId = useCallback((): string | null => {
    const s = useClaudeStore.getState();
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.sessionId ?? null;
  }, []);

  const executeSlashCommand = useCallback(
    async (cmd: SlashCommand, fullInput: string) => {
      if (cmd.handler === 'passthrough') {
        const sid = getActiveSessionId();
        if (!sid && cmd.requiresSession !== false) {
          pushSystemMessage(
            `\`${cmd.name}\` requires an active session. Send a message first to start a conversation.`,
          );
          return;
        }
        getClaudeClient().sendQuery(fullInput);
        return;
      }

      try {
        switch (cmd.name) {
          case '/clear': {
            resetActiveTab();
            break;
          }
          case '/new': {
            createTab();
            break;
          }
          case '/help': {
            let currentCat: string | null = null;
            const rows: string[] = [];
            for (const c of SLASH_COMMANDS) {
              const cat = getCategoryLabel(c.category);
              if (cat !== currentCat) {
                currentCat = cat;
                rows.push(`| **${cat}** | |`);
              }
              rows.push(`| \`${c.name}\` | ${c.description} |`);
            }
            const lines = [
              '**Available slash commands:**',
              '',
              '| Command | Description |',
              '|---------|-------------|',
              ...rows,
              '',
              'Type `@` to reference files. Use `Cmd+K` for the command palette.',
            ];
            pushSystemMessage(lines.join('\n'));
            break;
          }
          case '/usage': {
            const sid = getActiveSessionId();
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
            const sid = getActiveSessionId();
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
            const sid = getActiveSessionId();
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
          case '/bug':
            handleBug(pushSystemMessage);
            break;
          case '/config':
            await handleConfig(pushSystemMessage);
            break;
          case '/doctor':
            await handleDoctor(pushSystemMessage);
            break;
          case '/login':
            await handleLogin(pushSystemMessage);
            break;
          case '/logout':
            await handleLogout(pushSystemMessage);
            break;
          case '/status':
            await handleStatus(pushSystemMessage);
            break;
          case '/vim':
            handleVim(pushSystemMessage);
            break;
          case '/terminal-setup':
            handleTerminalSetup(pushSystemMessage);
            break;
          case '/permissions':
            await handlePermissions(pushSystemMessage);
            break;
          case '/approved-tools':
            await handleApprovedTools(pushSystemMessage);
            break;
          case '/mcp':
            await handleMcp(pushSystemMessage);
            break;
          case '/memory':
            await handleMemory(pushSystemMessage);
            break;
          case '/add-dir': {
            const args = fullInput.slice(cmd.name.length).trim();
            await handleAddDir(pushSystemMessage, args);
            break;
          }
          default:
            pushSystemMessage(`Unknown command: ${cmd.name}`);
        }
      } catch (err) {
        pushSystemMessage(`**Command error:** ${String(err)}`);
      }
    },
    [resetActiveTab, createTab, pushSystemMessage, getActiveSessionId],
  );

  const stickToBottom = useRef(true);

  const virtualizer = useVirtualizer({
    count: filteredMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  useEffect(() => {
    if (!stickToBottom.current || filteredMessages.length === 0) return;
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(filteredMessages.length - 1, { align: 'end' });
    });
  }, [filteredMessages.length, virtualizer]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
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
    const s = useClaudeStore.getState();
    const ts = s.activeTabId ? s.tabStates[s.activeTabId] : null;
    const reqId = ts?.currentRequestId;
    if (reqId) {
      getClaudeClient().abort(reqId);
    }
    s.setStreaming(false);
    s.setCurrentRequestId(null);
  }, []);

  const onSend = () => {
    if (!input.trim() || isStreaming) return;
    const trimmed = input.trim();

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
      onShowSlideDialog(trimmed);
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    <>
      <DropOverlay visible={isDragOver} />

      <ChatFilterBar tabId={tabId} />

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin flex-1 overflow-y-auto text-sm"
        style={claudeZoom !== 1 ? { zoom: claudeZoom } : undefined}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
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

      <SessionInfoBar tabId={tabId} />

      <AttachedFilesBar files={pendingFiles} onRemove={removePendingFile} />

      {activeTabPath && (
        <div className="flex items-center gap-1 border-t px-2 py-0.5 text-[10px] text-muted-foreground">
          <span className="shrink-0">Focusing:</span>
          <span className="truncate font-mono" title={activeTabPath}>
            {activeTabPath}
          </span>
        </div>
      )}

      {isStreaming && (
        <StreamingActivityBar tabId={tabId} />
      )}

      {isStreaming && <div className="claude-streaming-bar" />}

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
              rows={2}
              className={`w-full resize-none rounded-md border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring${isStreaming ? ' claude-streaming-input' : ''}`}
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
    </>
  );
}
