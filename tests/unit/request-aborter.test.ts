import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  abortRequest,
  registerAborter,
  __resetAborterForTests,
} from '@/lib/claude/request-aborter';

describe('request-aborter', () => {
  beforeEach(() => {
    __resetAborterForTests();
  });

  it('abortRequest returns false when no aborter is registered', () => {
    expect(abortRequest('req-1')).toBe(false);
  });

  it('abortRequest forwards the requestId to the registered callback and returns true', () => {
    const spy = vi.fn();
    registerAborter(spy);
    expect(abortRequest('req-42')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('req-42');
  });

  it('registering a second aborter replaces the first (single active registration)', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerAborter(first);
    registerAborter(second);
    abortRequest('req-x');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('req-x');
  });

  it('__resetAborterForTests returns the module to the unregistered state', () => {
    registerAborter(() => {});
    __resetAborterForTests();
    expect(abortRequest('req-after-reset')).toBe(false);
  });
});
