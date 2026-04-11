import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs file without type declarations.
import { isIgnoredByWatcher, WATCHER_IGNORE_GLOBS } from '../../server-handlers/files-handler.mjs';

// Regression guard for the EMFILE crash on macOS: chokidar 5 dropped native
// fsevents support and uses `fs.watch` under the hood, which consumes one
// file descriptor per directory and hits the 256-per-process limit. We now
// use @parcel/watcher (FSEvents-backed, one handle per root). This test
// covers two things:
//
//   1. The native `ignore` globs we hand to @parcel/watcher cover every heavy
//      directory we rely on skipping — so the whole subtree is never scanned.
//   2. The JS-level predicate still hides dotfiles and known heavy dirs that
//      slipped through (legacy safety net + event-broadcast filter).
describe('watcher ignore predicate', () => {
  const ROOT = '/Users/me/Projects/ClaudeGUI';

  const ignored = [
    `${ROOT}/node_modules`,
    `${ROOT}/node_modules/lodash`,
    `${ROOT}/node_modules/lodash/dist/lodash.js`,
    `${ROOT}/.next`,
    `${ROOT}/.next/cache/webpack/client-development/0.pack.gz`,
    `${ROOT}/.git`,
    `${ROOT}/.git/HEAD`,
    `${ROOT}/.claude`,
    `${ROOT}/.claude/worktrees/foo`,
    `${ROOT}/dist`,
    `${ROOT}/dist/bundle.js`,
    `${ROOT}/build`,
    `${ROOT}/out`,
    `${ROOT}/coverage/lcov-report/index.html`,
    `${ROOT}/test-results/report.xml`,
    `${ROOT}/playwright-report/index.html`,
    `${ROOT}/src/components/.DS_Store`,
  ];

  const notIgnored = [
    ROOT,
    `${ROOT}/src`,
    `${ROOT}/src/components/panels/file-explorer/file-tree.tsx`,
    `${ROOT}/docs/srs/03-functional-requirements.md`,
    `${ROOT}/package.json`,
    // The project-local Claude config should remain visible so users can see
    // and edit their own project settings.
    `${ROOT}/.claude-project`,
    `${ROOT}/.claude-project/settings.json`,
    // A folder whose *name* merely contains a substring like "out" or "dist"
    // should not be ignored — the pattern must be segment-anchored.
    `${ROOT}/src/components/layout`,
    `${ROOT}/src/lib/distributed`,
    `${ROOT}/docs/about`,
  ];

  it.each(ignored)('ignores %s', (p) => {
    expect(isIgnoredByWatcher(p)).toBe(true);
  });

  it.each(notIgnored)('does not ignore %s', (p) => {
    expect(isIgnoredByWatcher(p)).toBe(false);
  });
});

describe('watcher native ignore globs', () => {
  it('covers every heavy directory with both top and subtree patterns', () => {
    const expectedDirs = [
      'node_modules',
      '.next',
      '.git',
      '.claude',
      '.claude-worktrees',
      '.turbo',
      '.cache',
      'dist',
      'build',
      'out',
      'coverage',
      'test-results',
      'playwright-report',
    ];
    for (const name of expectedDirs) {
      expect(WATCHER_IGNORE_GLOBS).toContain(`**/${name}`);
      expect(WATCHER_IGNORE_GLOBS).toContain(`**/${name}/**`);
    }
  });
});
