#!/usr/bin/env node
/**
 * Patches Next.js generate-build-id.js to handle Node.js 24+ where
 * config.generateBuildId may be undefined due to ESM/CJS interop
 * changes in the config loading pipeline.
 *
 * This is a workaround for https://github.com/vercel/next.js/issues/XXXXX
 * and can be removed once Next.js fixes the upstream issue.
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'next',
  'dist',
  'build',
  'generate-build-id.js',
);

if (!fs.existsSync(filePath)) {
  console.log('[patch-next] next not installed yet, skipping');
  process.exit(0);
}

let src = fs.readFileSync(filePath, 'utf8');

const needle = 'let buildId = await generate();';
const replacement =
  "let buildId = typeof generate === 'function' ? await generate() : null;";

if (src.includes(replacement)) {
  console.log('[patch-next] already patched');
  process.exit(0);
}

if (!src.includes(needle)) {
  console.warn('[patch-next] target line not found — Next.js version may have changed');
  process.exit(0);
}

src = src.replace(needle, replacement);
fs.writeFileSync(filePath, src);
console.log('[patch-next] patched generate-build-id.js for Node.js 24+ compatibility');
