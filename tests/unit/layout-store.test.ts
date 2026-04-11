import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore } from '@/stores/use-layout-store';

describe('useLayoutStore', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      fileExplorerSize: 20,
      editorSize: 65,
      terminalSize: 35,
      previewSize: 30,
      fileExplorerCollapsed: false,
      terminalCollapsed: false,
      previewCollapsed: false,
      theme: 'dark',
      fontSize: 14,
    });
  });

  it('toggles panel collapsed state', () => {
    useLayoutStore.getState().togglePanel('fileExplorer');
    expect(useLayoutStore.getState().fileExplorerCollapsed).toBe(true);
    useLayoutStore.getState().togglePanel('fileExplorer');
    expect(useLayoutStore.getState().fileExplorerCollapsed).toBe(false);
  });

  it('cycles theme via setTheme', () => {
    useLayoutStore.getState().setTheme('light');
    expect(useLayoutStore.getState().theme).toBe('light');
    useLayoutStore.getState().setTheme('high-contrast');
    expect(useLayoutStore.getState().theme).toBe('high-contrast');
  });

  it('clamps font size between 10 and 24', () => {
    for (let i = 0; i < 20; i++) useLayoutStore.getState().increaseFontSize();
    expect(useLayoutStore.getState().fontSize).toBe(24);
    for (let i = 0; i < 30; i++) useLayoutStore.getState().decreaseFontSize();
    expect(useLayoutStore.getState().fontSize).toBe(10);
  });

  it('sets a panel size', () => {
    useLayoutStore.getState().setPanelSize('editor', 70);
    expect(useLayoutStore.getState().editorSize).toBe(70);
  });
});
