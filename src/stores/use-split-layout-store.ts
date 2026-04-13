'use client';

import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';

// ── Types ──

export type SplitDirection = 'horizontal' | 'vertical';
export type PanelContentType = 'fileExplorer' | 'editor' | 'terminal' | 'claude' | 'preview';

export interface SplitNode {
  type: 'split';
  id: string;
  direction: SplitDirection;
  children: [LayoutNode, LayoutNode];
  /** Size ratio of first child (0–100). Second child gets the remainder. */
  ratio: number;
  /** react-resizable-panels autoSaveId for localStorage persistence of sizes */
  autoSaveId?: string;
  /** Min size for the non-leaf wrapper panel (e.g. the "center" panel) */
  minSize?: number;
}

export interface LeafNode {
  type: 'leaf';
  id: string;
  panelType: PanelContentType;
  collapsed: boolean;
  /** Minimum panel size (percentage) */
  minSize?: number;
  /** Maximum panel size (percentage) */
  maxSize?: number;
}

export type LayoutNode = SplitNode | LeafNode;

const MAX_SPLIT_DEPTH = 4;

// ── Default layout ──

function defaultLayout(): LayoutNode {
  // File explorer 18% (fixed ratio) | remaining 82% split into 3 equal columns:
  //   editor 33.3% | claude 33.3% | preview 33.3%
  // Binary tree encoding: editor (ratio 33) | [claude (ratio 50) | preview]
  return {
    type: 'split',
    id: 'root',
    direction: 'horizontal',
    ratio: 18,
    autoSaveId: 'claudegui-split-root',
    children: [
      { type: 'leaf', id: 'leaf-fileExplorer', panelType: 'fileExplorer', collapsed: false, minSize: 10, maxSize: 40 },
      {
        type: 'split',
        id: 'split-center-right',
        direction: 'horizontal',
        ratio: 33,
        minSize: 20,
        autoSaveId: 'claudegui-split-center-right',
        children: [
          { type: 'leaf', id: 'leaf-editor', panelType: 'editor', collapsed: false, minSize: 10 },
          {
            type: 'split',
            id: 'split-right',
            direction: 'horizontal',
            ratio: 50,
            autoSaveId: 'claudegui-split-right',
            children: [
              { type: 'leaf', id: 'leaf-claude', panelType: 'claude', collapsed: false, minSize: 10 },
              { type: 'leaf', id: 'leaf-preview', panelType: 'preview', collapsed: false, minSize: 10 },
            ],
          },
        ],
      },
    ],
  };
}

// ── Tree helpers ──

function findLeafInTree(node: LayoutNode, leafId: string): LeafNode | null {
  if (node.type === 'leaf') return node.id === leafId ? node : null;
  return findLeafInTree(node.children[0], leafId) ?? findLeafInTree(node.children[1], leafId);
}

function findLeafByTypeInTree(node: LayoutNode, panelType: PanelContentType): LeafNode | null {
  if (node.type === 'leaf') return node.panelType === panelType ? node : null;
  return findLeafByTypeInTree(node.children[0], panelType) ?? findLeafByTypeInTree(node.children[1], panelType);
}

export function findAllLeavesByType(node: LayoutNode, panelType: PanelContentType): LeafNode[] {
  if (node.type === 'leaf') return node.panelType === panelType ? [node] : [];
  return [
    ...findAllLeavesByType(node.children[0], panelType),
    ...findAllLeavesByType(node.children[1], panelType),
  ];
}

function getDepth(node: LayoutNode): number {
  if (node.type === 'leaf') return 0;
  return 1 + Math.max(getDepth(node.children[0]), getDepth(node.children[1]));
}

function mapLeaf(node: LayoutNode, leafId: string, fn: (leaf: LeafNode) => LeafNode): LayoutNode {
  if (node.type === 'leaf') {
    return node.id === leafId ? fn(node) : node;
  }
  return {
    ...node,
    children: [
      mapLeaf(node.children[0], leafId, fn),
      mapLeaf(node.children[1], leafId, fn),
    ],
  };
}

function updateSplitRatio(node: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (node.type === 'leaf') return node;
  if (node.id === splitId) return { ...node, ratio };
  return {
    ...node,
    children: [
      updateSplitRatio(node.children[0], splitId, ratio),
      updateSplitRatio(node.children[1], splitId, ratio),
    ],
  };
}

/** Replace a leaf with a split containing the original leaf and a new leaf. */
function splitLeafInTree(
  node: LayoutNode,
  leafId: string,
  direction: SplitDirection,
  newLeaf: LeafNode,
  position: 'before' | 'after',
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.id !== leafId) return node;
    const splitId = `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const children: [LayoutNode, LayoutNode] =
      position === 'before' ? [newLeaf, node] : [node, newLeaf];
    return { type: 'split', id: splitId, direction, ratio: 50, children };
  }
  return {
    ...node,
    children: [
      splitLeafInTree(node.children[0], leafId, direction, newLeaf, position),
      splitLeafInTree(node.children[1], leafId, direction, newLeaf, position),
    ],
  };
}

/** Remove a leaf and collapse its parent split to the sibling. */
function removeLeafFromTree(node: LayoutNode, leafId: string): LayoutNode | null {
  if (node.type === 'leaf') {
    return node.id === leafId ? null : node;
  }
  const left = removeLeafFromTree(node.children[0], leafId);
  const right = removeLeafFromTree(node.children[1], leafId);
  if (left === null && right === null) return null;
  if (left === null) return right;
  if (right === null) return left;
  return { ...node, children: [left, right] };
}

let leafCounter = 0;

function generateLeafId(panelType: PanelContentType): string {
  return `leaf-${panelType}-${Date.now()}-${++leafCounter}`;
}

// ── Throttled storage (reuse pattern from layout store) ──

function createThrottledStorage<T>(): PersistStorage<T> {
  let pendingValue: StorageValue<T> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (name: string) => {
    if (pendingValue === null) return;
    try {
      localStorage.setItem(name, JSON.stringify(pendingValue));
    } catch { /* quota exceeded */ }
    pendingValue = null;
    timer = null;
  };

  let storageName = '';

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (storageName && pendingValue !== null) flush(storageName);
    });
  }

  return {
    getItem: (name) => {
      storageName = name;
      const raw = localStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<T>) : null;
    },
    setItem: (name, value) => {
      storageName = name;
      pendingValue = value;
      if (timer) return;
      timer = setTimeout(() => flush(name), 1_000);
    },
    removeItem: (name) => {
      pendingValue = null;
      if (timer) { clearTimeout(timer); timer = null; }
      localStorage.removeItem(name);
    },
  };
}

// ── Store ──

interface SplitLayoutState {
  root: LayoutNode;
  focusedLeafId: string | null;
  lastFocusedLeafByType: Record<PanelContentType, string | null>;

  // Queries
  findLeaf: (leafId: string) => LeafNode | null;
  findLeafByPanelType: (panelType: PanelContentType) => LeafNode | null;

  // Mutations
  splitLeaf: (leafId: string, direction: SplitDirection, newPanelType: PanelContentType, position: 'before' | 'after') => string | null;
  removeLeaf: (leafId: string) => void;
  updateRatio: (splitId: string, ratio: number) => void;
  toggleLeafCollapsed: (leafId: string) => void;
  setLeafCollapsed: (leafId: string, collapsed: boolean) => void;

  // Panel-type-based collapse (backward compat with existing layout store API)
  togglePanelByType: (panelType: PanelContentType) => void;
  setPanelCollapsedByType: (panelType: PanelContentType, collapsed: boolean) => void;
  isPanelCollapsed: (panelType: PanelContentType) => boolean;

  // Focus
  setFocusedLeaf: (leafId: string | null) => void;

  // Reset
  resetToDefault: () => void;
}

export const useSplitLayoutStore = create<SplitLayoutState>()(
  persist(
    (set, get) => ({
      root: defaultLayout(),
      focusedLeafId: null,
      lastFocusedLeafByType: {
        fileExplorer: 'leaf-fileExplorer',
        editor: 'leaf-editor',
        terminal: null,
        claude: 'leaf-claude',
        preview: 'leaf-preview',
      },

      findLeaf: (leafId) => findLeafInTree(get().root, leafId),
      findLeafByPanelType: (panelType) => findLeafByTypeInTree(get().root, panelType),

      splitLeaf: (leafId, direction, newPanelType, position) => {
        const { root } = get();
        if (getDepth(root) >= MAX_SPLIT_DEPTH) return null;
        const newLeafId = generateLeafId(newPanelType);
        const newLeaf: LeafNode = {
          type: 'leaf',
          id: newLeafId,
          panelType: newPanelType,
          collapsed: false,
        };
        const newRoot = splitLeafInTree(root, leafId, direction, newLeaf, position);
        set({ root: newRoot });
        return newLeafId;
      },

      removeLeaf: (leafId) => {
        const { root } = get();
        const result = removeLeafFromTree(root, leafId);
        if (result) set({ root: result });
      },

      updateRatio: (splitId, ratio) => {
        set((s) => ({ root: updateSplitRatio(s.root, splitId, ratio) }));
      },

      toggleLeafCollapsed: (leafId) => {
        set((s) => ({
          root: mapLeaf(s.root, leafId, (leaf) => ({ ...leaf, collapsed: !leaf.collapsed })),
        }));
      },

      setLeafCollapsed: (leafId, collapsed) => {
        set((s) => ({
          root: mapLeaf(s.root, leafId, (leaf) => ({ ...leaf, collapsed })),
        }));
      },

      togglePanelByType: (panelType) => {
        const { root, lastFocusedLeafByType } = get();
        const preferredId = lastFocusedLeafByType[panelType];
        const leaf = preferredId
          ? findLeafInTree(root, preferredId)
          : findLeafByTypeInTree(root, panelType);
        if (leaf) {
          set((s) => ({
            root: mapLeaf(s.root, leaf.id, (l) => ({ ...l, collapsed: !l.collapsed })),
          }));
        }
      },

      setPanelCollapsedByType: (panelType, collapsed) => {
        const { root, lastFocusedLeafByType } = get();
        const preferredId = lastFocusedLeafByType[panelType];
        const leaf = preferredId
          ? findLeafInTree(root, preferredId)
          : findLeafByTypeInTree(root, panelType);
        if (leaf) {
          set((s) => ({
            root: mapLeaf(s.root, leaf.id, (l) => ({ ...l, collapsed })),
          }));
        }
      },

      isPanelCollapsed: (panelType) => {
        const leaf = findLeafByTypeInTree(get().root, panelType);
        return leaf?.collapsed ?? false;
      },

      setFocusedLeaf: (leafId) => {
        if (!leafId) {
          set({ focusedLeafId: null });
          return;
        }
        const leaf = findLeafInTree(get().root, leafId);
        if (leaf) {
          set((s) => ({
            focusedLeafId: leafId,
            lastFocusedLeafByType: {
              ...s.lastFocusedLeafByType,
              [leaf.panelType]: leafId,
            },
          }));
        }
      },

      resetToDefault: () => set({ root: defaultLayout() }),
    }),
    {
      name: 'claudegui-split-layout',
      storage: createThrottledStorage<SplitLayoutState>(),
      partialize: (state) => {
        const { focusedLeafId: _, ...rest } = state;
        return rest as SplitLayoutState;
      },
      version: 5,
      migrate: (persisted: unknown, version: number) => {
        // v1→2: added autoSaveId, minSize, maxSize.
        // v2→3: changed autoSaveId keys to avoid conflict with old 4-panel layout.
        // v3→4: removed terminal panel from default layout (external terminal only).
        // v4→5: 3-column equal split (editor | claude | preview).
        if (version < 5) {
          return { root: defaultLayout() } as unknown as SplitLayoutState;
        }
        try {
          const state = persisted as Record<string, unknown>;
          if (!state.root) return { ...state, root: defaultLayout() } as unknown as SplitLayoutState;
          return state as unknown as SplitLayoutState;
        } catch {
          return { root: defaultLayout() } as unknown as SplitLayoutState;
        }
      },
    },
  ),
);

// Clean up old react-resizable-panels localStorage keys from the previous
// hardcoded 4-panel layout. These keys stored size data for a different
// number of panels and would corrupt the new 2-panel split tree layout.
if (typeof window !== 'undefined') {
  for (const key of ['react-resizable-panels:claudegui-root', 'react-resizable-panels:claudegui-center']) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}
