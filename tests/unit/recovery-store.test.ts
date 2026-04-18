import { describe, it, expect, beforeEach } from 'vitest';
import { useRecoveryStore } from '@/stores/use-recovery-store';
import { stashBuffer, discardAllBuffers } from '@/lib/editor/buffer-recovery';

describe('useRecoveryStore', () => {
  beforeEach(() => {
    discardAllBuffers();
    useRecoveryStore.setState({ buffers: [], modalOpen: false });
  });

  it('refresh() loads stashed buffers and opens the modal when any exist', () => {
    stashBuffer('src/a.ts', 'hello');
    stashBuffer('src/b.ts', 'world');
    useRecoveryStore.getState().refresh();
    const s = useRecoveryStore.getState();
    expect(s.buffers).toHaveLength(2);
    expect(s.modalOpen).toBe(true);
  });

  it('refresh() keeps the modal closed when the stash is empty', () => {
    useRecoveryStore.getState().refresh();
    expect(useRecoveryStore.getState().modalOpen).toBe(false);
    expect(useRecoveryStore.getState().buffers).toEqual([]);
  });

  it('closeModal() leaves buffers intact for later inspection', () => {
    stashBuffer('src/a.ts', 'hello');
    useRecoveryStore.getState().refresh();
    useRecoveryStore.getState().closeModal();
    const s = useRecoveryStore.getState();
    expect(s.modalOpen).toBe(false);
    expect(s.buffers).toHaveLength(1);
  });

  it('discardOne() removes the target buffer from both state and storage', () => {
    stashBuffer('src/a.ts', 'A');
    stashBuffer('src/b.ts', 'B');
    useRecoveryStore.getState().refresh();
    useRecoveryStore.getState().discardOne('src/a.ts');

    const s = useRecoveryStore.getState();
    expect(s.buffers.map((b) => b.path)).toEqual(['src/b.ts']);

    // Simulate a fresh load — confirms persistence layer is in sync.
    useRecoveryStore.setState({ buffers: [], modalOpen: false });
    useRecoveryStore.getState().refresh();
    expect(useRecoveryStore.getState().buffers.map((b) => b.path)).toEqual(['src/b.ts']);
  });

  it('discardAll() clears buffers, closes the modal, and persists the emptying', () => {
    stashBuffer('src/a.ts', 'A');
    stashBuffer('src/b.ts', 'B');
    useRecoveryStore.getState().refresh();
    useRecoveryStore.getState().discardAll();

    const s = useRecoveryStore.getState();
    expect(s.buffers).toEqual([]);
    expect(s.modalOpen).toBe(false);

    useRecoveryStore.getState().refresh();
    expect(useRecoveryStore.getState().buffers).toEqual([]);
  });

  it('openModal() can surface the panel even when buffers is empty', () => {
    useRecoveryStore.getState().openModal();
    expect(useRecoveryStore.getState().modalOpen).toBe(true);
  });
});
