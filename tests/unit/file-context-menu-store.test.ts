import { describe, it, expect, beforeEach } from 'vitest';
import { useFileContextMenuStore } from '@/stores/use-file-context-menu-store';
import type { TreeNode } from '@/components/panels/file-explorer/use-file-tree';

const node: TreeNode = {
  id: 'src/foo.ts',
  name: 'foo.ts',
  path: 'src/foo.ts',
  isDirectory: false,
};

beforeEach(() => {
  useFileContextMenuStore.setState({
    open: false,
    scope: 'node',
    anchorX: 0,
    anchorY: 0,
    target: null,
    selectionPaths: [],
  });
});

describe('useFileContextMenuStore', () => {
  it('opens at a node with coordinates and selection', () => {
    useFileContextMenuStore
      .getState()
      .openAtNode({ clientX: 120, clientY: 240 }, node, ['src/foo.ts', 'src/bar.ts']);
    const s = useFileContextMenuStore.getState();
    expect(s.open).toBe(true);
    expect(s.scope).toBe('node');
    expect(s.target).toEqual(node);
    expect(s.anchorX).toBe(120);
    expect(s.anchorY).toBe(240);
    expect(s.selectionPaths).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  it('opens at empty area without a target', () => {
    useFileContextMenuStore.getState().openAtEmpty({ clientX: 10, clientY: 20 });
    const s = useFileContextMenuStore.getState();
    expect(s.open).toBe(true);
    expect(s.scope).toBe('empty');
    expect(s.target).toBeNull();
    expect(s.selectionPaths).toEqual([]);
  });

  it('closes the menu without losing the previous anchor', () => {
    useFileContextMenuStore
      .getState()
      .openAtNode({ clientX: 50, clientY: 60 }, node, []);
    useFileContextMenuStore.getState().close();
    const s = useFileContextMenuStore.getState();
    expect(s.open).toBe(false);
    expect(s.anchorX).toBe(50);
    expect(s.anchorY).toBe(60);
  });

  it('replaces target and anchor when opened on a different node', () => {
    useFileContextMenuStore
      .getState()
      .openAtNode({ clientX: 1, clientY: 1 }, node, ['src/foo.ts']);
    const otherNode: TreeNode = {
      id: 'src/bar.ts',
      name: 'bar.ts',
      path: 'src/bar.ts',
      isDirectory: false,
    };
    useFileContextMenuStore
      .getState()
      .openAtNode({ clientX: 222, clientY: 333 }, otherNode, ['src/bar.ts']);
    const s = useFileContextMenuStore.getState();
    expect(s.target).toEqual(otherNode);
    expect(s.anchorX).toBe(222);
    expect(s.anchorY).toBe(333);
    expect(s.selectionPaths).toEqual(['src/bar.ts']);
  });
});
