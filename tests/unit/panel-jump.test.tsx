import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJumpToPanel, PANEL_JUMP_ORDER } from '@/hooks/use-panel-jump';
import { useLayoutStore } from '@/stores/use-layout-store';
import { useSplitLayoutStore } from '@/stores/use-split-layout-store';

describe('PANEL_JUMP_ORDER', () => {
  it('addresses the five panels in a stable order', () => {
    expect(PANEL_JUMP_ORDER).toEqual([
      'fileExplorer',
      'editor',
      'terminal',
      'claude',
      'preview',
    ]);
  });
});

describe('useJumpToPanel', () => {
  beforeEach(() => {
    // Fresh layout state — focusedPanel null, default split.
    useLayoutStore.setState({ focusedPanel: null });
    useSplitLayoutStore.getState().resetToDefault();
    document.body.innerHTML = '';
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
  });

  it('sets focusedPanel in the layout store', () => {
    const { result } = renderHook(() => useJumpToPanel());
    act(() => result.current('editor'));
    expect(useLayoutStore.getState().focusedPanel).toBe('editor');
  });

  it('uncollapses the target panel if it is collapsed', () => {
    useSplitLayoutStore.getState().setPanelCollapsedByType('claude', true);
    expect(useSplitLayoutStore.getState().isPanelCollapsed('claude')).toBe(true);

    const { result } = renderHook(() => useJumpToPanel());
    act(() => result.current('claude'));

    expect(useSplitLayoutStore.getState().isPanelCollapsed('claude')).toBe(false);
  });

  it('does NOT re-collapse a panel that is already visible', () => {
    expect(useSplitLayoutStore.getState().isPanelCollapsed('editor')).toBe(false);
    const { result } = renderHook(() => useJumpToPanel());
    act(() => result.current('editor'));
    expect(useSplitLayoutStore.getState().isPanelCollapsed('editor')).toBe(false);
  });

  it('focuses the DOM element matching [data-panel-id="<panel>"]', () => {
    const el = document.createElement('div');
    el.setAttribute('data-panel-id', 'preview');
    el.tabIndex = 0;
    document.body.appendChild(el);

    const { result } = renderHook(() => useJumpToPanel());
    act(() => result.current('preview'));

    expect(document.activeElement).toBe(el);
  });

  it('retries via requestAnimationFrame when the element is not yet mounted', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

    const { result } = renderHook(() => useJumpToPanel());
    act(() => result.current('terminal'));

    expect(rafSpy).toHaveBeenCalled();
  });

  it('returns a stable callback across renders', () => {
    const { result, rerender } = renderHook(() => useJumpToPanel());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
