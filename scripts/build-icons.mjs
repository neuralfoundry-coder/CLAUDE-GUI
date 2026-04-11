#!/usr/bin/env node
// Regenerate raster icon assets from public/branding/claudegui.svg.
// Requires macOS (uses qlmanage + sips). Outputs are committed; this script
// only needs to run when the SVG source changes.
//
// Usage:  node scripts/build-icons.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_SVG = join(ROOT, 'public/branding/claudegui.svg');
const OUT_DIR = join(ROOT, 'public/branding');
const APP_DIR = join(ROOT, 'src/app');

const PNG_SIZES = [16, 32, 48, 64, 128, 180, 256, 512];
const ICO_SIZES = [16, 32, 48, 64, 128, 256];

function log(msg) { process.stdout.write(`[icons] ${msg}\n`); }

if (platform() !== 'darwin') {
  console.error('build-icons.mjs requires macOS (qlmanage + sips).');
  console.error('The committed PNG/ICO files in public/branding/ are the canonical artifacts.');
  process.exit(1);
}

if (!existsSync(SRC_SVG)) {
  console.error(`Source SVG not found: ${SRC_SVG}`);
  process.exit(1);
}

const work = join(tmpdir(), `claudegui-icons-${process.pid}`);
mkdirSync(work, { recursive: true });

function rasterize(size) {
  const sizeDir = join(work, String(size));
  mkdirSync(sizeDir, { recursive: true });
  // qlmanage renders into a directory using the source filename + .png
  execFileSync('qlmanage', ['-t', '-s', String(size), '-o', sizeDir, SRC_SVG], { stdio: 'pipe' });
  const rendered = join(sizeDir, 'claudegui.svg.png');
  if (!existsSync(rendered)) throw new Error(`qlmanage failed for size ${size}`);
  // qlmanage may render at different aspect; force exact square via sips.
  execFileSync('sips', ['-z', String(size), String(size), rendered], { stdio: 'pipe' });
  const out = join(OUT_DIR, `claudegui-${size}.png`);
  copyFileSync(rendered, out);
  log(`PNG ${size}×${size} → ${out.replace(ROOT + '/', '')}`);
  return out;
}

function packIco(pngPaths, outPath) {
  // PNG-in-ICO container (Vista+ compatible).
  const entries = pngPaths.map((p) => {
    const data = readFileSync(p);
    // Width comes from filename suffix (claudegui-NN.png).
    const m = /claudegui-(\d+)\.png$/.exec(p);
    const px = m ? Number(m[1]) : 0;
    return { px, data };
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);            // reserved
  header.writeUInt16LE(1, 2);            // type = 1 (icon)
  header.writeUInt16LE(entries.length, 4);

  const dirEntries = Buffer.alloc(16 * entries.length);
  let offset = header.length + dirEntries.length;
  entries.forEach((entry, i) => {
    const o = i * 16;
    // 256 must be encoded as 0 (single-byte field)
    dirEntries.writeUInt8(entry.px >= 256 ? 0 : entry.px, o + 0);
    dirEntries.writeUInt8(entry.px >= 256 ? 0 : entry.px, o + 1);
    dirEntries.writeUInt8(0, o + 2);     // colorCount
    dirEntries.writeUInt8(0, o + 3);     // reserved
    dirEntries.writeUInt16LE(1, o + 4);  // planes
    dirEntries.writeUInt16LE(32, o + 6); // bitCount
    dirEntries.writeUInt32LE(entry.data.length, o + 8);
    dirEntries.writeUInt32LE(offset, o + 12);
    offset += entry.data.length;
  });

  writeFileSync(outPath, Buffer.concat([header, dirEntries, ...entries.map((e) => e.data)]));
  log(`ICO ${entries.length} sizes → ${outPath.replace(ROOT + '/', '')}`);
}

try {
  log(`source: ${SRC_SVG.replace(ROOT + '/', '')}`);
  mkdirSync(OUT_DIR, { recursive: true });

  const pngs = {};
  for (const s of PNG_SIZES) pngs[s] = rasterize(s);

  // Windows ICO
  packIco(ICO_SIZES.map((s) => pngs[s]), join(OUT_DIR, 'claudegui.ico'));

  // Next.js favicon (SVG) — copy as-is
  copyFileSync(SRC_SVG, join(APP_DIR, 'icon.svg'));
  log(`favicon → src/app/icon.svg`);

  // Apple touch icon (180×180)
  copyFileSync(pngs[180], join(APP_DIR, 'apple-icon.png'));
  log(`apple touch → src/app/apple-icon.png`);

  log('done');
} finally {
  rmSync(work, { recursive: true, force: true });
}
