import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createDebug } from '../debug.mjs';

const dbg = createDebug('project');

const GLOBAL_KEY = '__claudegui_project_context__';
const STATE_DIR = path.join(os.homedir(), '.claudegui');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const MAX_RECENTS = 10;

function safeReadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    /* ignore */
  }
  return {};
}

function safeWriteState(state) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    dbg.error('failed to persist state', err);
  }
}

function resolveInitialRoot(persisted) {
  const envRoot = process.env.PROJECT_ROOT;
  if (envRoot && isUsableDir(envRoot)) return path.resolve(envRoot);
  if (persisted.lastRoot && isUsableDir(persisted.lastRoot)) return path.resolve(persisted.lastRoot);
  return null;
}

function isUsableDir(p) {
  try {
    const stat = fs.statSync(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function getStore() {
  const g = globalThis;
  if (!g[GLOBAL_KEY]) {
    const persisted = safeReadState();
    const activeRoot = resolveInitialRoot(persisted);
    const recents = Array.isArray(persisted.recents) ? persisted.recents.filter(isUsableDir) : [];
    if (activeRoot && !recents.includes(activeRoot)) recents.unshift(activeRoot);
    g[GLOBAL_KEY] = {
      activeRoot,
      recents: recents.slice(0, MAX_RECENTS),
      listeners: new Set(),
    };
    if (activeRoot) {
      safeWriteState({ lastRoot: activeRoot, recents: g[GLOBAL_KEY].recents });
    }
  }
  return g[GLOBAL_KEY];
}

export function getActiveRoot() {
  return getStore().activeRoot;
}

export function getRecents() {
  return [...getStore().recents];
}

export function setActiveRoot(newRoot) {
  if (typeof newRoot !== 'string' || newRoot.trim() === '') {
    throw new ProjectRootError('newRoot must be a non-empty string', 4400);
  }
  if (!path.isAbsolute(newRoot)) {
    throw new ProjectRootError('Path must be absolute', 4400);
  }
  const abs = path.resolve(newRoot);
  validateProjectRoot(abs);
  const store = getStore();
  if (store.activeRoot === abs) return abs;
  dbg.info('root change', { from: store.activeRoot, to: abs });
  store.activeRoot = abs;
  store.recents = [abs, ...store.recents.filter((r) => r !== abs)].slice(0, MAX_RECENTS);
  safeWriteState({ lastRoot: abs, recents: store.recents });
  dbg.trace('notifying', store.listeners.size, 'listeners');
  for (const listener of store.listeners) {
    try {
      listener(abs);
    } catch (err) {
      dbg.error('listener error', err);
    }
  }
  return abs;
}

export function onActiveRootChange(listener) {
  const store = getStore();
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

export function validateProjectRoot(absPath) {
  if (!path.isAbsolute(absPath)) {
    throw new ProjectRootError('Path must be absolute', 4400);
  }
  const root = path.parse(absPath).root;
  if (absPath === root) {
    throw new ProjectRootError('Filesystem root is not allowed as project root', 4403);
  }
  let stat;
  try {
    stat = fs.statSync(absPath);
  } catch {
    throw new ProjectRootError('Path does not exist', 4404);
  }
  if (!stat.isDirectory()) {
    throw new ProjectRootError('Path is not a directory', 4400);
  }
  try {
    fs.accessSync(absPath, fs.constants.R_OK);
  } catch {
    throw new ProjectRootError('Path is not readable', 4403);
  }
}

export class ProjectRootError extends Error {
  constructor(message, code = 4400) {
    super(message);
    this.name = 'ProjectRootError';
    this.code = code;
  }
}
