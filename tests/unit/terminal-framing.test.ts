import { describe, it, expect } from 'vitest';
import {
  parseServerControlFrame,
  isServerControlFrame,
} from '@/lib/terminal/terminal-framing';

describe('terminal-framing', () => {
  describe('isServerControlFrame', () => {
    it('recognises exit frames', () => {
      expect(isServerControlFrame({ type: 'exit', code: 0 })).toBe(true);
    });

    it('recognises error frames', () => {
      expect(
        isServerControlFrame({ type: 'error', code: 'BUFFER_OVERFLOW', message: 'x' }),
      ).toBe(true);
    });

    it('rejects non-control objects', () => {
      expect(isServerControlFrame({ type: 'data' })).toBe(false);
      expect(isServerControlFrame(null)).toBe(false);
      expect(isServerControlFrame('exit')).toBe(false);
      expect(isServerControlFrame({})).toBe(false);
    });
  });

  describe('parseServerControlFrame', () => {
    it('parses a valid exit frame', () => {
      const frame = parseServerControlFrame('{"type":"exit","code":137}');
      expect(frame).toEqual({ type: 'exit', code: 137 });
    });

    it('parses a valid error frame', () => {
      const frame = parseServerControlFrame(
        '{"type":"error","code":"BUFFER_OVERFLOW","message":"too much"}',
      );
      expect(frame).toEqual({
        type: 'error',
        code: 'BUFFER_OVERFLOW',
        message: 'too much',
      });
    });

    it('returns null on non-control JSON', () => {
      expect(parseServerControlFrame('{"type":"data","value":42}')).toBeNull();
    });

    it('returns null on non-JSON text', () => {
      expect(parseServerControlFrame('hello world')).toBeNull();
      expect(parseServerControlFrame('{ not json')).toBeNull();
    });

    it('does not mistake shell JSON output for a control frame', () => {
      const pkg = '{"name":"claudegui","version":"1.0.0"}';
      expect(parseServerControlFrame(pkg)).toBeNull();
    });
  });
});
