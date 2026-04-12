'use client';

import { Terminal, Bot, AlertCircle, Shield, MessageSquare } from 'lucide-react';
import { useShallow } from 'zustand/shallow';
import { Button } from '@/components/ui/button';
import { useClaudeStore, type MessageKind } from '@/stores/use-claude-store';
import { cn } from '@/lib/utils';

const FILTER_ITEMS: Array<{
  kind: MessageKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { kind: 'text', label: 'Text', icon: MessageSquare },
  { kind: 'tool_use', label: 'Tools', icon: Terminal },
  { kind: 'system', label: 'System', icon: Bot },
  { kind: 'auto_decision', label: 'Auto', icon: Shield },
  { kind: 'error', label: 'Errors', icon: AlertCircle },
];

export function ChatFilterBar() {
  const messageFilter = useClaudeStore((s) => s.messageFilter);
  const toggleFilter = useClaudeStore((s) => s.toggleFilter);
  // Derive kind→count map instead of subscribing to the full messages array.
  // Re-renders only when the counts actually change (shallow equality).
  const counts = useClaudeStore(useShallow((s) => {
    const c: Record<string, number> = {};
    for (const m of s.messages) c[m.kind] = (c[m.kind] ?? 0) + 1;
    return c;
  }));

  return (
    <div className="flex items-center gap-1 border-b bg-muted/50 px-2 py-0.5">
      {FILTER_ITEMS.map(({ kind, label, icon: Icon }) => {
        const active = messageFilter.has(kind);
        const count = counts[kind] ?? 0;
        return (
          <Button
            key={kind}
            variant="ghost"
            size="sm"
            className={cn(
              'h-5 gap-1 px-1.5 text-[10px]',
              active ? 'text-foreground' : 'text-muted-foreground/50 line-through',
            )}
            onClick={() => toggleFilter(kind)}
            title={`${active ? 'Hide' : 'Show'} ${label}`}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            <span>{label}</span>
            {count > 0 && (
              <span className="ml-0.5 rounded-full bg-muted px-1 text-[9px] font-medium">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
