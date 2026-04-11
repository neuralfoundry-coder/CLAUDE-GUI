'use client';

import { create } from 'zustand';
import type { TreeNode } from '@/components/panels/file-explorer/use-file-tree';

export type FileContextMenuScope = 'node' | 'empty';

interface FileContextMenuState {
  open: boolean;
  scope: FileContextMenuScope;
  anchorX: number;
  anchorY: number;
  target: TreeNode | null;
  selectionPaths: string[];

  openAtNode: (event: { clientX: number; clientY: number }, target: TreeNode, selectionPaths: string[]) => void;
  openAtEmpty: (event: { clientX: number; clientY: number }) => void;
  close: () => void;
}

export const useFileContextMenuStore = create<FileContextMenuState>((set) => ({
  open: false,
  scope: 'node',
  anchorX: 0,
  anchorY: 0,
  target: null,
  selectionPaths: [],

  openAtNode: (event, target, selectionPaths) =>
    set({
      open: true,
      scope: 'node',
      anchorX: event.clientX,
      anchorY: event.clientY,
      target,
      selectionPaths,
    }),

  openAtEmpty: (event) =>
    set({
      open: true,
      scope: 'empty',
      anchorX: event.clientX,
      anchorY: event.clientY,
      target: null,
      selectionPaths: [],
    }),

  close: () => set({ open: false }),
}));
