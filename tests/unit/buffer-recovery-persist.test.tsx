import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBufferRecoveryPersist } from '@/hooks/use-buffer-recovery-persist';
import { useEditorStore } from '@/stores/use-editor-store';
import { discardAllBuffers, getStashedBuffers } from '@/lib/editor/buffer-recovery';

function setTabs(tabs: Array<{ path: string; content: string; dirty: boolean }>) {
  useEditorStore.setState({
    tabs: tabs.map((t) => ({
      id: t.path,
      path: t.path,
      content: t.content,
      originalContent: t.content,
      dirty: t.dirty,
      locked: false,
      diff: null,
    })),
    activeTabId: tabs[0]?.path ?? null,
  });
}

describe('useBufferRecoveryPersist', () => {
  beforeEach(() => {
    discardAllBuffers();
    useEditorStore.setState({ tabs: [], activeTabId: null });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not stash clean tabs', () => {
    renderHook(() => useBufferRecoveryPersist());
    setTabs([{ path: 'a.ts', content: 'hello', dirty: false }]);
    vi.advanceTimersByTime(2000);
    expect(getStashedBuffers()).toEqual([]);
  });

  it('debounces and stashes dirty tabs after the debounce window', () => {
    renderHook(() => useBufferRecoveryPersist());
    setTabs([{ path: 'a.ts', content: 'draft', dirty: true }]);

    // Before the debounce fires, nothing is stashed yet.
    vi.advanceTimersByTime(500);
    expect(getStashedBuffers()).toEqual([]);

    // After 1s, the stash fires.
    vi.advanceTimersByTime(600);
    const all = getStashedBuffers();
    expect(all).toHaveLength(1);
    expect(all[0]!.path).toBe('a.ts');
    expect(all[0]!.content).toBe('draft');
  });

  it('coalesces rapid edits into a single stash write', () => {
    renderHook(() => useBufferRecoveryPersist());
    setTabs([{ path: 'a.ts', content: 'v1', dirty: true }]);
    vi.advanceTimersByTime(300);
    setTabs([{ path: 'a.ts', content: 'v2', dirty: true }]);
    vi.advanceTimersByTime(300);
    setTabs([{ path: 'a.ts', content: 'v3', dirty: true }]);
    // Only the final value should land after the debounce.
    vi.advanceTimersByTime(1100);
    const all = getStashedBuffers();
    expect(all).toHaveLength(1);
    expect(all[0]!.content).toBe('v3');
  });

  it('discards the stash when a tab becomes clean (saved)', () => {
    renderHook(() => useBufferRecoveryPersist());
    setTabs([{ path: 'a.ts', content: 'draft', dirty: true }]);
    vi.advanceTimersByTime(1100);
    expect(getStashedBuffers()).toHaveLength(1);

    setTabs([{ path: 'a.ts', content: 'draft', dirty: false }]);
    // Transition to clean is synchronous — the stash is cleared right away.
    expect(getStashedBuffers()).toHaveLength(0);
  });

  it('cancels a pending stash when the tab is closed before the debounce fires', () => {
    renderHook(() => useBufferRecoveryPersist());
    setTabs([{ path: 'a.ts', content: 'partial', dirty: true }]);
    vi.advanceTimersByTime(400);

    // Tab disappears mid-debounce — the scheduled stash must not fire.
    setTabs([]);
    vi.advanceTimersByTime(2000);
    expect(getStashedBuffers()).toEqual([]);
  });

  it('avoids redundant writes when content has not changed since last stash', () => {
    renderHook(() => useBufferRecoveryPersist());
    setTabs([{ path: 'a.ts', content: 'same', dirty: true }]);
    vi.advanceTimersByTime(1100);
    expect(getStashedBuffers()).toHaveLength(1);
    const firstSavedAt = getStashedBuffers()[0]!.savedAt;

    // Re-enter the same subscribe frame with unchanged content — no reschedule.
    vi.advanceTimersByTime(5);
    setTabs([{ path: 'a.ts', content: 'same', dirty: true }]);
    vi.advanceTimersByTime(2000);

    // savedAt should not advance because no new write was scheduled.
    expect(getStashedBuffers()[0]!.savedAt).toBe(firstSavedAt);
  });

  it('keeps stashes for multiple dirty tabs independent', () => {
    renderHook(() => useBufferRecoveryPersist());
    setTabs([
      { path: 'a.ts', content: 'A', dirty: true },
      { path: 'b.ts', content: 'B', dirty: true },
    ]);
    vi.advanceTimersByTime(1100);
    const all = getStashedBuffers();
    expect(all).toHaveLength(2);
    expect(all.map((b) => b.path).sort()).toEqual(['a.ts', 'b.ts']);
  });
});
