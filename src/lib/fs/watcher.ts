import path from 'node:path';
import type { FSWatcher } from 'chokidar';

type ChangeEvent = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'ready';

export interface WatcherEvent {
  event: ChangeEvent;
  path: string;
  timestamp: string;
}

export type WatcherListener = (event: WatcherEvent) => void;

export interface Watcher {
  close(): Promise<void>;
  addListener(listener: WatcherListener): void;
  removeListener(listener: WatcherListener): void;
}

const IGNORED = [
  /(^|[/\\])\.(?!claude-project$)/,
  /node_modules/,
  /\.next/,
  /dist|build|out/,
  /\.DS_Store/,
];

export async function createWatcher(rootAbs: string): Promise<Watcher> {
  const chokidar = await import('chokidar');
  const fsw: FSWatcher = chokidar.watch(rootAbs, {
    ignored: IGNORED,
    followSymlinks: false,
    persistent: true,
    ignoreInitial: true,
  });

  const listeners = new Set<WatcherListener>();

  const emit = (event: ChangeEvent, fullPath: string) => {
    const rel = path.relative(rootAbs, fullPath);
    const payload: WatcherEvent = {
      event,
      path: rel || '.',
      timestamp: new Date().toISOString(),
    };
    for (const l of listeners) l(payload);
  };

  (['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const).forEach((evt) => {
    fsw.on(evt, (p: string) => emit(evt, p));
  });
  fsw.on('ready', () => emit('ready', rootAbs));

  return {
    async close() {
      await fsw.close();
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
