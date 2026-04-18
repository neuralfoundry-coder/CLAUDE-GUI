import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLayoutPresetsStore, BUILTIN_PRESETS } from '@/stores/use-layout-presets-store';
import { useSplitLayoutStore } from '@/stores/use-split-layout-store';

// Suppress zustand persist storage warnings in jsdom.
beforeEach(() => {
  useLayoutPresetsStore.setState({ userPresets: {} });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('layout presets', () => {
  it('lists 3 built-in presets', () => {
    const all = useLayoutPresetsStore.getState().listAllPresets();
    expect(all.filter((p) => p.builtin)).toHaveLength(3);
    expect(all.map((p) => p.name)).toEqual(
      expect.arrayContaining(['Editor Focus', 'Preview Split', 'Terminal Focus']),
    );
  });

  it('built-in presets each produce a valid root when applied', () => {
    for (const preset of BUILTIN_PRESETS) {
      const root = preset.buildRoot!();
      expect(root).toBeTruthy();
      expect(root.type === 'split' || root.type === 'leaf').toBe(true);
    }
  });

  it('applyPreset replaces the split layout root', () => {
    const before = useSplitLayoutStore.getState().root;
    const ok = useLayoutPresetsStore.getState().applyPreset('builtin:editor-focus');
    expect(ok).toBe(true);
    const after = useSplitLayoutStore.getState().root;
    expect(after).not.toBe(before);
  });

  it('returns false for unknown preset ids', () => {
    expect(useLayoutPresetsStore.getState().applyPreset('nope')).toBe(false);
  });

  it('saves a user preset and can re-apply it', () => {
    const originalRoot = useSplitLayoutStore.getState().root;
    const id = useLayoutPresetsStore.getState().savePreset('My Layout');

    const saved = useLayoutPresetsStore.getState().userPresets[id];
    expect(saved).toBeTruthy();
    expect(saved!.name).toBe('My Layout');
    expect(saved!.builtin).toBe(false);

    // Mutate the split layout...
    useSplitLayoutStore.setState({ root: { type: 'leaf', id: 'x', panelType: 'editor', collapsed: false } });
    // ...and apply the preset — layout should restore.
    useLayoutPresetsStore.getState().applyPreset(id);
    expect(useSplitLayoutStore.getState().root).toEqual(originalRoot);
  });

  it('trims whitespace and falls back to "Untitled preset" for empty names', () => {
    const id = useLayoutPresetsStore.getState().savePreset('   ');
    expect(useLayoutPresetsStore.getState().userPresets[id]!.name).toBe('Untitled preset');
  });

  it('deletePreset removes only the target user preset', () => {
    const a = useLayoutPresetsStore.getState().savePreset('A');
    const b = useLayoutPresetsStore.getState().savePreset('B');
    useLayoutPresetsStore.getState().deletePreset(a);
    expect(useLayoutPresetsStore.getState().userPresets[a]).toBeUndefined();
    expect(useLayoutPresetsStore.getState().userPresets[b]).toBeTruthy();
  });

  it('listAllPresets returns built-ins first, then user presets alphabetically', () => {
    useLayoutPresetsStore.getState().savePreset('Zebra');
    useLayoutPresetsStore.getState().savePreset('Apple');
    const all = useLayoutPresetsStore.getState().listAllPresets();
    const userNames = all.filter((p) => !p.builtin).map((p) => p.name);
    expect(userNames).toEqual(['Apple', 'Zebra']);
    // Built-ins keep their original registration order
    expect(all[0]!.builtin).toBe(true);
    expect(all[1]!.builtin).toBe(true);
    expect(all[2]!.builtin).toBe(true);
  });
});
