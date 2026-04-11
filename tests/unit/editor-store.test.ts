import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  filesApi: {
    read: vi.fn(async (path: string) => ({ content: `content of ${path}`, encoding: 'utf-8', size: 10 })),
    write: vi.fn(async () => ({ size: 0 })),
  },
}));

import { useEditorStore } from '@/stores/use-editor-store';

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.setState({ tabs: [], activeTabId: null });
  });

  it('opens a file and sets it as active', async () => {
    await useEditorStore.getState().openFile('src/hello.ts');
    const s = useEditorStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]!.path).toBe('src/hello.ts');
    expect(s.activeTabId).toBe('src/hello.ts');
  });

  it('focuses existing tab instead of re-opening', async () => {
    await useEditorStore.getState().openFile('a.ts');
    await useEditorStore.getState().openFile('b.ts');
    await useEditorStore.getState().openFile('a.ts');
    const s = useEditorStore.getState();
    expect(s.tabs).toHaveLength(2);
    expect(s.activeTabId).toBe('a.ts');
  });

  it('updates content and marks dirty', async () => {
    await useEditorStore.getState().openFile('a.ts');
    useEditorStore.getState().updateContent('a.ts', 'new content');
    expect(useEditorStore.getState().tabs[0]!.dirty).toBe(true);
  });

  it('applies and accepts a Claude edit', async () => {
    await useEditorStore.getState().openFile('a.ts');
    useEditorStore.getState().applyClaudeEdit('a.ts', 'claude-modified');
    expect(useEditorStore.getState().tabs[0]!.locked).toBe(true);
    expect(useEditorStore.getState().tabs[0]!.diff).not.toBeNull();
    useEditorStore.getState().acceptDiff('a.ts');
    const tab = useEditorStore.getState().tabs[0]!;
    expect(tab.content).toBe('claude-modified');
    expect(tab.locked).toBe(false);
    expect(tab.diff).toBeNull();
  });

  it('rejects a Claude edit and restores state', async () => {
    await useEditorStore.getState().openFile('a.ts');
    const original = useEditorStore.getState().tabs[0]!.content;
    useEditorStore.getState().applyClaudeEdit('a.ts', 'claude-modified');
    useEditorStore.getState().rejectDiff('a.ts');
    const tab = useEditorStore.getState().tabs[0]!;
    expect(tab.content).toBe(original);
    expect(tab.locked).toBe(false);
  });

  it('closes a tab and updates active', async () => {
    await useEditorStore.getState().openFile('a.ts');
    await useEditorStore.getState().openFile('b.ts');
    useEditorStore.getState().closeTab('b.ts');
    expect(useEditorStore.getState().tabs).toHaveLength(1);
    expect(useEditorStore.getState().activeTabId).toBe('a.ts');
  });
});
