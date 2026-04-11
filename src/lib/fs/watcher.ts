import path from 'node:path';

type ChangeEvent = 'add' | 'change' | 'unlink' | 'ready' | 'error';

export interface WatcherEvent {
  event: ChangeEvent;
  path: string;
  timestamp: string;
  message?: string;
}

export type WatcherListener = (event: WatcherEvent) => void;

export interface Watcher {
  close(): Promise<void>;
  addListener(listener: WatcherListener): void;
  removeListener(listener: WatcherListener): void;
}

// @parcel/watcher uses FSEvents (macOS) / inotify (Linux) / ReadDirectoryChangesW
// (Windows) under the hood, so a whole-project subscription consumes 1 handle
// per root — not 1 per directory like chokidar's `fs.watch` fallback. This is
// what keeps macOS from hitting the 256-FD per-process limit (EMFILE) that
// chokidar 5 hits after it dropped native fsevents support.
const IGNORE_DIR_NAMES = [
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

// Glob patterns handed to @parcel/watcher's native ignore. We skip the whole
// subtree of each heavy directory — the native watcher never descends into it.
export const WATCHER_IGNORE_GLOBS: string[] = IGNORE_DIR_NAMES.flatMap((name) => [
  `**/${name}`,
  `**/${name}/**`,
]);

// JS-level predicate for the remaining policy (hidden dotfiles, .DS_Store).
// `.claude-project` is kept visible because it's user-facing configuration.
const HIDDEN_DOT_SEGMENT =
  /(^|[/\\])\.(?!claude-project($|[/\\]))[^/\\]*($|[/\\])/;

function segmentPattern(name: string): RegExp {
  return new RegExp(`(^|[/\\\\])${name.replace(/\./g, '\\.')}($|[/\\\\])`);
}

const JS_IGNORE_REGEXES: RegExp[] = [
  HIDDEN_DOT_SEGMENT,
  ...IGNORE_DIR_NAMES.map(segmentPattern),
];

export function isIgnoredByWatcher(p: string): boolean {
  return JS_IGNORE_REGEXES.some((re) => re.test(p));
}

interface ParcelWatcherEvent {
  type: 'create' | 'update' | 'delete';
  path: string;
}

interface ParcelSubscription {
  unsubscribe(): Promise<void>;
}

interface ParcelWatcherModule {
  subscribe(
    dir: string,
    cb: (err: Error | null, events: ParcelWatcherEvent[]) => void,
    opts: { ignore: string[] },
  ): Promise<ParcelSubscription>;
}

function mapEvent(type: ParcelWatcherEvent['type']): ChangeEvent {
  if (type === 'create') return 'add';
  if (type === 'delete') return 'unlink';
  return 'change';
}

export async function createWatcher(rootAbs: string): Promise<Watcher> {
  const mod = (await import('@parcel/watcher')) as unknown as ParcelWatcherModule;
  const listeners = new Set<WatcherListener>();

  const emit = (event: ChangeEvent, rel: string, message?: string) => {
    const payload: WatcherEvent = {
      event,
      path: rel || '.',
      timestamp: new Date().toISOString(),
      ...(message ? { message } : {}),
    };
    for (const l of listeners) l(payload);
  };

  const subscription = await mod.subscribe(
    rootAbs,
    (err, events) => {
      if (err) {
        emit('error', '.', String(err.message || err));
        return;
      }
      for (const ev of events) {
        if (isIgnoredByWatcher(ev.path)) continue;
        const rel = path.relative(rootAbs, ev.path);
        emit(mapEvent(ev.type), rel);
      }
    },
    { ignore: WATCHER_IGNORE_GLOBS },
  );

  emit('ready', rootAbs);

  return {
    async close() {
      await subscription.unsubscribe();
      listeners.clear();
    },
    addListener(l) {
      listeners.add(l);
    },
    removeListener(l) {
      listeners.delete(l);
    },
  };
}

let sharedWatcher: Watcher | null = null;

export async function getSharedWatcher(rootAbs: string): Promise<Watcher> {
  if (sharedWatcher) return sharedWatcher;
  sharedWatcher = await createWatcher(rootAbs);
  return sharedWatcher;
}
