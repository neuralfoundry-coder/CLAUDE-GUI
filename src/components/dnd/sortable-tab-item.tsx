'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DragData } from './dnd-provider';

interface SortableTabItemProps {
  id: string;
  dragData: DragData;
  children: React.ReactNode;
}

export function SortableTabItem({ id, dragData, children }: SortableTabItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: dragData,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  // dnd-kit spreads role="button" tabindex="0" onto the wrapper for keyboard
  // drag support, which nests two focusable elements (this div + the inner tab
  // button) and trips axe's `focusable-content` / nested-interactive rules.
  // We favour pointer-only drag on tabs, so we strip the focusable attributes
  // — the inner button remains the single focus target.
  const { role: _role, tabIndex: _tabIndex, ...safeAttributes } = attributes;

  return (
    <div ref={setNodeRef} style={style} {...safeAttributes} {...listeners}>
      {children}
    </div>
  );
}
