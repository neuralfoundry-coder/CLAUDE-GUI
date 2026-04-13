'use client';

import { createContext, useCallback, useContext, useId, useState, type RefObject } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { computeDropZone } from '@/hooks/use-drop-zones';

export interface DragData {
  tabId: string;
  sourceType: 'editor' | 'claude' | 'terminal';
  sourceLeafId?: string;
}

export type DropZone = 'center' | 'top' | 'bottom' | 'left' | 'right' | null;

interface ActiveDragState {
  id: string;
  data: DragData;
}

interface DndMonitorState {
  isDragging: boolean;
  /** Leaf ID → current drop zone within that leaf */
  leafZones: Record<string, DropZone>;
}

const DndMonitorContext = createContext<DndMonitorState>({
  isDragging: false,
  leafZones: {},
});

export function useDndMonitor(
  leafId: string,
  _containerRef?: RefObject<HTMLDivElement | null>,
): { activeZone: DropZone; isDragging: boolean } {
  const state = useContext(DndMonitorContext);
  return {
    activeZone: state.leafZones[leafId] ?? null,
    isDragging: state.isDragging,
  };
}

interface DndProviderProps {
  children: React.ReactNode;
  onTabReorder?: (sourceType: string, activeId: string, overId: string) => void;
  onTabDropOnLeaf?: (data: DragData, targetLeafId: string, zone: DropZone) => void;
}

export function DndProvider({ children, onTabReorder, onTabDropOnLeaf }: DndProviderProps) {
  const dndId = useId();
  const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null);
  const [monitorState, setMonitorState] = useState<DndMonitorState>({
    isDragging: false,
    leafZones: {},
  });

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 5,
    },
  });

  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });

  const sensors = useSensors(pointerSensor, keyboardSensor);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (data) {
      setActiveDrag({ id: String(event.active.id), data });
      setMonitorState({ isDragging: true, leafZones: {} });
    }
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    if (!event.over) {
      setMonitorState((s) => (s.isDragging ? { ...s, leafZones: {} } : s));
      return;
    }

    const overId = String(event.over.id);
    // Only track leaf drop zones (not sortable tab items)
    if (!overId.startsWith('leaf-drop-')) return;

    const leafId = overId.replace('leaf-drop-', '');
    const overElement = event.over.rect
      ? document.querySelector(`[data-leaf-id="${leafId}"]`)
      : null;

    if (!overElement) return;

    const rect = overElement.getBoundingClientRect();
    // DragMoveEvent provides activatorEvent which has clientX/Y
    const pointerEvent = event.activatorEvent as PointerEvent | undefined;
    if (!pointerEvent) return;

    // Calculate current pointer position from initial + delta
    const clientX = pointerEvent.clientX + (event.delta?.x ?? 0);
    const clientY = pointerEvent.clientY + (event.delta?.y ?? 0);

    const zone = computeDropZone(rect, clientX, clientY);
    setMonitorState((s) => ({
      ...s,
      leafZones: { [leafId]: zone },
    }));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    const activeData = active.data.current as DragData | undefined;

    // Reset state
    setActiveDrag(null);
    setMonitorState({ isDragging: false, leafZones: {} });

    if (!over || !activeData) return;

    const overId = String(over.id);

    // If dropped on a leaf drop zone
    if (overId.startsWith('leaf-drop-')) {
      const leafId = overId.replace('leaf-drop-', '');
      const leafZone = monitorState.leafZones[leafId] ?? 'center';
      onTabDropOnLeaf?.(activeData, leafId, leafZone);
      return;
    }

    // If dropped on another sortable tab (reorder within same panel)
    if (active.id !== over.id) {
      onTabReorder?.(activeData.sourceType, String(active.id), String(over.id));
    }
  }, [onTabReorder, onTabDropOnLeaf, monitorState.leafZones]);

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
    setMonitorState({ isDragging: false, leafZones: {} });
  }, []);

  return (
    <DndMonitorContext.Provider value={monitorState}>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeDrag && (
            <div className="rounded border bg-popover px-3 py-1 text-xs shadow-md opacity-80">
              {activeDrag.data.tabId}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </DndMonitorContext.Provider>
  );
}
