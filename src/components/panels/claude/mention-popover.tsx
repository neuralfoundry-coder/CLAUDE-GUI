'use client';

import { useEffect, useRef } from 'react';
import { File, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProjectFileItem } from '@/lib/fs/list-project-files';

interface MentionPopoverProps {
  items: ProjectFileItem[];
  activeIndex: number;
  onSelect: (item: ProjectFileItem) => void;
  onHover: (index: number) => void;
}

export function MentionPopover({ items, activeIndex, onSelect, onHover }: MentionPopoverProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (items.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-lg"
      role="dialog"
      aria-label="File mention suggestions"
    >
      <ul ref={listRef} role="listbox" className="py-1 text-xs">
        {items.map((item, i) => (
          <li
            key={`${item.type}:${item.path}`}
            role="option"
            aria-selected={i === activeIndex}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
            onMouseEnter={() => onHover(i)}
            className={cn(
              'flex cursor-pointer items-center gap-2 px-3 py-1.5',
              i === activeIndex && 'bg-accent text-accent-foreground',
            )}
          >
            {item.type === 'directory' ? (
              <Folder className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <File className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="truncate">{item.path}</span>
            {item.type === 'directory' && (
              <span className="ml-auto text-[10px] text-muted-foreground">dir</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
