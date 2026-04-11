'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useClaudeStore } from '@/stores/use-claude-store';
import { getClaudeClient } from '@/lib/websocket/claude-client';

export function ClaudeChatPanel() {
  const [input, setInput] = useState('');
  const messages = useClaudeStore((s) => s.messages);
  const isStreaming = useClaudeStore((s) => s.isStreaming);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const onSend = () => {
    if (!input.trim() || isStreaming) return;
    getClaudeClient().sendQuery(input.trim());
    setInput('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="flex h-full flex-col border-l bg-background">
      <div className="flex h-7 items-center border-b bg-muted px-3">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Claude</span>
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
      <div className="border-t p-2">
        <div className="flex items-start gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask Claude..."
            rows={2}
            className="flex-1 resize-none rounded-md border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button size="icon" onClick={onSend} disabled={isStreaming || !input.trim()}>
            {isStreaming ? <Square className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
