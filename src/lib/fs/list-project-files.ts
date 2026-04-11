import { filesApi } from '@/lib/api-client';

export interface ProjectFileItem {
  path: string;
  name: string;
  type: 'file' | 'directory';
}

interface CrawlOptions {
  maxDepth?: number;
  includeDirectories?: boolean;
  /** Cap the total number of items returned. Used to bound runaway crawls. */
  maxEntries?: number;
}

/**
 * Directories skipped during project crawling. These never contain source
 * files the user wants in `@mention` autocomplete or Cmd+P, and listing
 * them explodes the request count — `node_modules` alone can easily push
 * past the `/api/files` rate limit (300 req / 60 s).
 */
const SKIP_DIRS = new Set<string>([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.nuxt',
  '.svelte-kit',
  '.vercel',
  '.netlify',
  '.yarn',
  '.pnpm-store',
  '.pnp',
  'dist',
  'build',
  'out',
  'coverage',
  '.nyc_output',
  '.venv',
  'venv',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.tox',
  '.idea',
  '.vscode',
  '.fleet',
  '.DS_Store',
  'target',
  'Pods',
  '.gradle',
  'cmake-build-debug',
  'cmake-build-release',
  'tmp',
  'temp',
]);

export async function listProjectFiles(
  dir = '',
  options: CrawlOptions = {},
  depth = 0,
  state: { count: number } = { count: 0 },
): Promise<ProjectFileItem[]> {
  const { maxDepth = 3, includeDirectories = false, maxEntries = 5000 } = options;
  if (depth > maxDepth) return [];
  if (state.count >= maxEntries) return [];
  try {
    const { entries } = await filesApi.list(dir);
    const out: ProjectFileItem[] = [];
    for (const e of entries) {
      if (state.count >= maxEntries) break;
      if (SKIP_DIRS.has(e.name)) continue;
      // Skip hidden dotfiles/dirs — almost never useful in autocomplete and
      // often part of tooling caches that blow up the request count.
      if (e.name.startsWith('.')) continue;
      const full = dir ? `${dir}/${e.name}` : e.name;
      if (e.type === 'directory') {
        if (includeDirectories) {
          out.push({ path: full, name: e.name, type: 'directory' });
          state.count += 1;
        }
        const sub = await listProjectFiles(full, options, depth + 1, state);
        out.push(...sub);
      } else {
        out.push({ path: full, name: e.name, type: 'file' });
        state.count += 1;
      }
    }
    return out;
  } catch {
    return [];
  }
}
