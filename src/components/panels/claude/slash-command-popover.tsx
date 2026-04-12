'use client';

import { useEffect, useRef } from 'react';
import { Terminal, Info, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SlashCommand } from '@/lib/claude/slash-commands';
import { getCategoryLabel } from '@/lib/claude/slash-commands';

interface SlashCommandPopoverProps {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onHover: (index: number) => void;
}

const CATEGORY_ICONS: Record<SlashCommand['category'], typeof Terminal> = {
  session: Terminal,
  info: Info,
  mode: Zap,
};

export function SlashCommandPopover({
  commands,
  activeIndex,
  onSelect,
  onHover,
}: SlashCommandPopoverProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (commands.length === 0) return null;

  // Group commands by category for display
  let currentCategory: SlashCommand['category'] | null = null;
  let globalIndex = -1;

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-56 overflow-y-auto rounded-md border bg-popover shadow-lg"
      role="dialog"
      aria-label="Slash command suggestions"
    >
      <ul ref={listRef} role="listbox" className="py-1 text-xs">
        {commands.map((cmd) => {
          globalIndex += 1;
          const idx = globalIndex;
          const showHeader = cmd.category !== currentCategory;
          if (showHeader) currentCategory = cmd.category;
          const Icon = CATEGORY_ICONS[cmd.category];

          return (
            <li key={cmd.name} role="option" aria-selected={idx === activeIndex}>
              {showHeader && (
                <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase text-muted-foreground/60">
                  {getCategoryLabel(cmd.category)}
                </div>
              )}
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(cmd);
                }}
                onMouseEnter={() => onHover(idx)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 px-3 py-1.5',
                  idx === activeIndex && 'bg-accent text-accent-foreground',
                )}
              >
                <Icon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-mono font-medium">{cmd.name}</span>
                <span className="ml-auto truncate text-[10px] text-muted-foreground">
                  {cmd.description}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
