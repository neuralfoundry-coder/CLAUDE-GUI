import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const BRANDING = join(ROOT, 'public/branding');
const APP = join(ROOT, 'src/app');

// Files the install scripts (FR-1101) and Next.js favicon (FR-1103) depend on.
// If any of these go missing, double-clicking the desktop icon will copy a
// broken set into the user's icon directory.
const REQUIRED_BRANDING = [
  'claudegui.svg',
  'claudegui.ico',
  'claudegui-16.png',
  'claudegui-32.png',
  'claudegui-48.png',
  'claudegui-64.png',
  'claudegui-128.png',
  'claudegui-180.png',
  'claudegui-256.png',
  'claudegui-512.png',
];

describe('FR-1103 branding assets', () => {
  it('every required raster + ICO + SVG exists under public/branding/', () => {
    const missing = REQUIRED_BRANDING.filter(
      (f) => !existsSync(join(BRANDING, f)),
    );
    expect(missing).toEqual([]);
  });

  it('claudegui.svg parses as a non-empty SVG document', () => {
    const svg = readFileSync(join(BRANDING, 'claudegui.svg'), 'utf8');
    expect(svg.length).toBeGreaterThan(200);
    expect(svg).toMatch(/<svg[\s\S]*<\/svg>\s*$/);
    expect(svg).toContain('viewBox="0 0 512 512"');
  });

  it('claudegui.ico starts with the ICONDIR header (type=1, count>=1)', () => {
    const buf = readFileSync(join(BRANDING, 'claudegui.ico'));
    // ICONDIR: reserved(2) + type(2) + count(2)
    expect(buf.readUInt16LE(0)).toBe(0); // reserved
    expect(buf.readUInt16LE(2)).toBe(1); // type = 1 (icon)
    const count = buf.readUInt16LE(4);
    expect(count).toBeGreaterThanOrEqual(6);
  });

  it('PNG sizes are non-trivial (≥ 200 bytes each)', () => {
    for (const f of REQUIRED_BRANDING.filter((f) => f.endsWith('.png'))) {
      const size = statSync(join(BRANDING, f)).size;
      expect(size).toBeGreaterThan(200);
    }
  });
});

describe('FR-1103 Next.js favicon wiring', () => {
  it('src/app/icon.svg exists and matches the source SVG', () => {
    const branded = readFileSync(join(BRANDING, 'claudegui.svg'), 'utf8');
    const favicon = readFileSync(join(APP, 'icon.svg'), 'utf8');
    expect(favicon).toBe(branded);
  });

  it('src/app/apple-icon.png exists and is a valid PNG', () => {
    const path = join(APP, 'apple-icon.png');
    expect(existsSync(path)).toBe(true);
    const head = readFileSync(path).subarray(0, 8);
    // PNG magic: 89 50 4E 47 0D 0A 1A 0A
    expect(Array.from(head)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});
