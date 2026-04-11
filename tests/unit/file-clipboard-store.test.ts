import { describe, it, expect, beforeEach } from 'vitest';
import { useFileClipboardStore } from '@/stores/use-file-clipboard-store';

beforeEach(() => {
  useFileClipboardStore.setState({ paths: [], mode: null });
});

describe('useFileClipboardStore', () => {
  it('starts empty', () => {
    const s = useFileClipboardStore.getState();
    expect(s.paths).toEqual([]);
    expect(s.mode).toBeNull();
    expect(s.isCut('any')).toBe(false);
  });

  it('stores copy mode without flagging cut', () => {
    useFileClipboardStore.getState().setClipboard('copy', ['a.txt', 'b.txt']);
    const s = useFileClipboardStore.getState();
    expect(s.mode).toBe('copy');
    expect(s.paths).toEqual(['a.txt', 'b.txt']);
    expect(s.isCut('a.txt')).toBe(false);
  });

  it('flags cut paths via isCut', () => {
    useFileClipboardStore.getState().setClipboard('cut', ['x', 'y']);
    const s = useFileClipboardStore.getState();
    expect(s.isCut('x')).toBe(true);
    expect(s.isCut('y')).toBe(true);
    expect(s.isCut('z')).toBe(false);
  });

  it('clears state', () => {
    useFileClipboardStore.getState().setClipboard('cut', ['x']);
    useFileClipboardStore.getState().clear();
    const s = useFileClipboardStore.getState();
    expect(s.paths).toEqual([]);
    expect(s.mode).toBeNull();
    expect(s.isCut('x')).toBe(false);
  });

  it('replaces previous paths on subsequent setClipboard', () => {
    useFileClipboardStore.getState().setClipboard('cut', ['a']);
    useFileClipboardStore.getState().setClipboard('copy', ['b', 'c']);
    const s = useFileClipboardStore.getState();
    expect(s.mode).toBe('copy');
    expect(s.paths).toEqual(['b', 'c']);
  });
});
