/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';

/**
 * Mirrors the OSC 7 payload parsing in terminal-manager.ts so that the
 * contract (payload → absolute posix path) stays tested even though the
 * manager itself is hard to instantiate in isolation.
 */
function parseOsc7Payload(data: string): string | null {
  try {
    const url = new URL(data);
    if (url.protocol !== 'file:') return null;
    const decoded = decodeURIComponent(url.pathname);
    return decoded || null;
  } catch {
    return null;
  }
}

describe('OSC 7 cwd parser', () => {
  it('extracts a plain posix path', () => {
    expect(parseOsc7Payload('file://mac.local/Users/k/proj')).toBe('/Users/k/proj');
  });

  it('decodes percent-encoded segments', () => {
    expect(parseOsc7Payload('file://host/Users/k/My%20Project')).toBe('/Users/k/My Project');
  });

  it('handles unicode paths', () => {
    expect(parseOsc7Payload('file://host/tmp/%ED%85%8C%EC%8A%A4%ED%8A%B8')).toBe('/tmp/테스트');
  });

  it('returns null for malformed payloads', () => {
    expect(parseOsc7Payload('not-a-url')).toBe(null);
  });

  it('returns null for non-file protocol', () => {
    expect(parseOsc7Payload('https://host/path')).toBe(null);
  });
});
