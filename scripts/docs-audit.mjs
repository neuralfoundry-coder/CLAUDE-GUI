#!/usr/bin/env node
/**
 * docs-audit — enforce Korean ↔ English documentation parity.
 *
 * CLAUDE.md requires that every edit to a mirrored doc updates its counterpart
 * in the same commit. This script detects drift by comparing:
 *
 *   1. **File presence**: both mirrors must exist (or both be absent).
 *   2. **Heading structure**: same sequence of ATX (`#`/`##`/`###`/…) levels.
 *   3. **Stable IDs**: FR-xxx, NFR-xxx, ADR-xxx, UC-xxx referenced in either
 *      file must appear in both (ignoring the language of surrounding prose).
 *   4. **Table row count**: tables at the same position must have the same
 *      number of rows (header + separator + body).
 *
 * Usage:
 *   node scripts/docs-audit.mjs               # report drift to stdout, exit 1 if any
 *   node scripts/docs-audit.mjs --json        # machine-readable output
 *
 * Scope is intentionally heuristic: deep prose comparison is out of scope; we
 * only verify the skeleton and stable identifiers match. That's enough to
 * catch the common failure mode — a FR added to one language's spec but not
 * the other.
 */

import { readFile, access } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Mirror pairs: [KoreanPath, EnglishPath] — relative to repo root. */
const MIRRORED_PAIRS = [
  ['CLAUDE.md', 'CLAUDE-EN.md'],
  ['README.md', 'README-EN.md'],
  ['docs/srs/01-introduction.md', 'docs/en/srs/01-introduction.md'],
  ['docs/srs/02-overall-description.md', 'docs/en/srs/02-overall-description.md'],
  ['docs/srs/03-functional-requirements.md', 'docs/en/srs/03-functional-requirements.md'],
  ['docs/srs/04-non-functional-requirements.md', 'docs/en/srs/04-non-functional-requirements.md'],
  ['docs/srs/05-use-cases.md', 'docs/en/srs/05-use-cases.md'],
  ['docs/srs/06-external-interfaces.md', 'docs/en/srs/06-external-interfaces.md'],
  ['docs/srs/07-constraints-and-assumptions.md', 'docs/en/srs/07-constraints-and-assumptions.md'],
  ['docs/srs/README.md', 'docs/en/srs/README.md'],
  ['docs/architecture/01-system-overview.md', 'docs/en/architecture/01-system-overview.md'],
  ['docs/architecture/02-component-design.md', 'docs/en/architecture/02-component-design.md'],
  ['docs/architecture/03-data-flow.md', 'docs/en/architecture/03-data-flow.md'],
  ['docs/architecture/04-api-design.md', 'docs/en/architecture/04-api-design.md'],
  ['docs/architecture/05-security-architecture.md', 'docs/en/architecture/05-security-architecture.md'],
  ['docs/architecture/06-deployment.md', 'docs/en/architecture/06-deployment.md'],
  ['docs/architecture/terminal-v2-design.md', 'docs/en/architecture/terminal-v2-design.md'],
  ['docs/architecture/README.md', 'docs/en/architecture/README.md'],
];

const ID_PATTERN = /\b(?:FR|NFR|ADR|UC)-\d+[a-z]?\b/g;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the sequence of heading levels (1..6) in the order they appear.
 * Strips code blocks first so `#` inside a ```markdown fence isn't counted.
 */
function extractHeadingLevels(source) {
  const noCodeBlocks = source.replace(/```[\s\S]*?```/g, '');
  const levels = [];
  for (const line of noCodeBlocks.split('\n')) {
    const m = /^(#{1,6})\s+\S/.exec(line);
    if (m) levels.push(m[1].length);
  }
  return levels;
}

function extractIds(source) {
  const matches = source.match(ID_PATTERN) ?? [];
  return new Set(matches);
}

/**
 * Returns a list of row counts — one per table in source. A markdown table is
 * a contiguous run of lines starting with `|`.
 */
function extractTableRowCounts(source) {
  const noCodeBlocks = source.replace(/```[\s\S]*?```/g, '');
  const counts = [];
  let current = 0;
  for (const line of noCodeBlocks.split('\n')) {
    if (line.startsWith('|')) {
      current += 1;
    } else if (current > 0) {
      counts.push(current);
      current = 0;
    }
  }
  if (current > 0) counts.push(current);
  return counts;
}

function compareArrays(a, b) {
  if (a.length !== b.length) return { ok: false, detail: `lengths differ: ${a.length} vs ${b.length}` };
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return { ok: false, detail: `differ at index ${i}: ${a[i]} vs ${b[i]}` };
    }
  }
  return { ok: true };
}

function compareIdSets(ko, en) {
  const onlyInKo = [...ko].filter((id) => !en.has(id)).sort();
  const onlyInEn = [...en].filter((id) => !ko.has(id)).sort();
  if (onlyInKo.length === 0 && onlyInEn.length === 0) return { ok: true };
  return {
    ok: false,
    detail: [
      onlyInKo.length > 0 ? `only-in-KO: ${onlyInKo.join(', ')}` : null,
      onlyInEn.length > 0 ? `only-in-EN: ${onlyInEn.join(', ')}` : null,
    ].filter(Boolean).join(' | '),
  };
}

async function auditPair([koRel, enRel]) {
  const issues = [];
  const koAbs = join(ROOT, koRel);
  const enAbs = join(ROOT, enRel);

  const [koExists, enExists] = await Promise.all([exists(koAbs), exists(enAbs)]);
  if (koExists !== enExists) {
    issues.push({
      kind: 'presence',
      detail: `${koExists ? 'KO exists but EN missing' : 'EN exists but KO missing'}`,
    });
    return { pair: [koRel, enRel], issues };
  }
  if (!koExists && !enExists) {
    return { pair: [koRel, enRel], issues: [] };
  }

  const [ko, en] = await Promise.all([readFile(koAbs, 'utf8'), readFile(enAbs, 'utf8')]);

  const headingCmp = compareArrays(extractHeadingLevels(ko), extractHeadingLevels(en));
  if (!headingCmp.ok) {
    issues.push({ kind: 'heading-structure', detail: headingCmp.detail });
  }

  const idCmp = compareIdSets(extractIds(ko), extractIds(en));
  if (!idCmp.ok) {
    issues.push({ kind: 'stable-ids', detail: idCmp.detail });
  }

  const tableCmp = compareArrays(extractTableRowCounts(ko), extractTableRowCounts(en));
  if (!tableCmp.ok) {
    issues.push({ kind: 'table-rows', detail: tableCmp.detail });
  }

  return { pair: [koRel, enRel], issues };
}

export async function runAudit(pairs = MIRRORED_PAIRS) {
  const results = [];
  for (const pair of pairs) {
    results.push(await auditPair(pair));
  }
  return results;
}

function formatReport(results) {
  const lines = [];
  let drifts = 0;
  for (const { pair, issues } of results) {
    if (issues.length === 0) continue;
    drifts += 1;
    lines.push(`DRIFT: ${pair[0]} ↔ ${pair[1]}`);
    for (const issue of issues) {
      lines.push(`  - ${issue.kind}: ${issue.detail}`);
    }
  }
  if (drifts === 0) {
    lines.push(`OK: all ${results.length} mirrored pairs are in sync.`);
  } else {
    lines.push('');
    lines.push(`${drifts} pair(s) drifted out of ${results.length}.`);
  }
  return { text: lines.join('\n'), driftCount: drifts };
}

// CLI entry point — only runs when invoked directly, not when imported for tests.
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const asJson = process.argv.includes('--json');
  const results = await runAudit();
  if (asJson) {
    console.log(JSON.stringify(results, (_key, v) => (v instanceof Set ? [...v] : v), 2));
  } else {
    const { text, driftCount } = formatReport(results);
    console.log(text);
    if (driftCount > 0) process.exit(1);
  }
}

// Named exports for tests.
export {
  extractHeadingLevels,
  extractIds,
  extractTableRowCounts,
  compareArrays,
  compareIdSets,
  MIRRORED_PAIRS,
  formatReport,
};
export { relative as _relative };
