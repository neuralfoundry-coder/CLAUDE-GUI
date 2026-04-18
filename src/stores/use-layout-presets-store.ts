'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  useSplitLayoutStore,
  type LayoutNode,
  type SplitNode,
  type LeafNode,
  type PanelContentType,
} from './use-split-layout-store';

// ─────────────────────────────────────────────────────────────────────────────
// Built-in preset factories.  Pure functions returning a LayoutNode, so we
// never store heavy snapshots in memory until applied.
// ─────────────────────────────────────────────────────────────────────────────

function leaf(panelType: PanelContentType, collapsed = false, minSize = 10): LeafNode {
  return { type: 'leaf', id: `leaf-${panelType}`, panelType, collapsed, minSize };
}

function split(
  id: string,
  direction: 'horizontal' | 'vertical',
  ratio: number,
  autoSaveId: string,
  children: [LayoutNode, LayoutNode],
  minSize?: number,
): SplitNode {
  return { type: 'split', id, direction, ratio, autoSaveId, children, ...(minSize ? { minSize } : {}) };
}

/** Editor Focus — hide explorer/terminal, editor takes the main area. */
function editorFocusLayout(): LayoutNode {
  return split('root', 'horizontal', 18, 'claudegui-preset-root', [
    leaf('fileExplorer', true, 10),
    split('split-center-right', 'horizontal', 70, 'claudegui-preset-center-right', [
      leaf('editor', false, 10),
      leaf('claude', false, 10),
    ], 20),
  ]);
}

/** Preview Split — editor left, preview right (50/50), explorer collapsed. */
function previewSplitLayout(): LayoutNode {
  return split('root', 'horizontal', 18, 'claudegui-preset-root', [
    leaf('fileExplorer', true, 10),
    split('split-center-right', 'horizontal', 50, 'claudegui-preset-center-right', [
      leaf('editor', false, 10),
      leaf('preview', false, 10),
    ], 20),
  ]);
}

/** Terminal Focus — editor top, terminal bottom (60/40), explorer visible. */
function terminalFocusLayout(): LayoutNode {
  return split('root', 'horizontal', 18, 'claudegui-preset-root', [
    leaf('fileExplorer', false, 10),
    split('split-center-right', 'vertical', 60, 'claudegui-preset-center-right', [
      leaf('editor', false, 10),
      leaf('terminal', false, 10),
    ], 20),
  ]);
}

export interface LayoutPreset {
  id: string;
  name: string;
  builtin: boolean;
  /** For built-ins, `buildRoot` is set; for user presets, `root` is set. */
  buildRoot?: () => LayoutNode;
  root?: LayoutNode;
}

export const BUILTIN_PRESETS: LayoutPreset[] = [
  { id: 'builtin:editor-focus', name: 'Editor Focus', builtin: true, buildRoot: editorFocusLayout },
  { id: 'builtin:preview-split', name: 'Preview Split', builtin: true, buildRoot: previewSplitLayout },
  { id: 'builtin:terminal-focus', name: 'Terminal Focus', builtin: true, buildRoot: terminalFocusLayout },
];

// ─────────────────────────────────────────────────────────────────────────────
// User-saved presets store
// ─────────────────────────────────────────────────────────────────────────────

interface LayoutPresetsState {
  /** User-saved presets keyed by id. */
  userPresets: Record<string, LayoutPreset>;

  savePreset: (name: string) => string;
  deletePreset: (id: string) => void;
  applyPreset: (id: string) => boolean;
  listAllPresets: () => LayoutPreset[];
}

function nextUserPresetId(): string {
  return `user:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useLayoutPresetsStore = create<LayoutPresetsState>()(
  persist(
    (set, get) => ({
      userPresets: {},

      savePreset: (name) => {
        const trimmed = name.trim() || 'Untitled preset';
        const id = nextUserPresetId();
        const root = useSplitLayoutStore.getState().root;
        const preset: LayoutPreset = { id, name: trimmed, builtin: false, root };
        set((s) => ({ userPresets: { ...s.userPresets, [id]: preset } }));
        return id;
      },

      deletePreset: (id) => {
        set((s) => {
          if (!s.userPresets[id]) return s;
          const { [id]: _, ...rest } = s.userPresets;
          return { userPresets: rest };
        });
      },

      applyPreset: (id) => {
        const builtin = BUILTIN_PRESETS.find((p) => p.id === id);
        if (builtin?.buildRoot) {
          useSplitLayoutStore.setState({ root: builtin.buildRoot() });
          return true;
        }
        const user = get().userPresets[id];
        if (user?.root) {
          useSplitLayoutStore.setState({ root: user.root });
          return true;
        }
        return false;
      },

      listAllPresets: () => {
        const userList = Object.values(get().userPresets).sort((a, b) => a.name.localeCompare(b.name));
        return [...BUILTIN_PRESETS, ...userList];
      },
    }),
    {
      name: 'claudegui-layout-presets',
      version: 1,
      partialize: (state) => ({ userPresets: state.userPresets }) as LayoutPresetsState,
    },
  ),
);
