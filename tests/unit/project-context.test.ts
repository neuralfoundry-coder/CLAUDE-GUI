import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const GLOBAL_KEY = '__claudegui_project_context__';

async function loadModule() {
  vi.resetModules();
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = undefined;
  return import('@/lib/project/project-context.mjs');
}

let tmpA: string;
let tmpB: string;
let stateHome: string;
let originalHome: string | undefined;

beforeEach(async () => {
  tmpA = await fs.mkdtemp(path.join(os.tmpdir(), 'project-ctx-a-'));
  tmpB = await fs.mkdtemp(path.join(os.tmpdir(), 'project-ctx-b-'));
  stateHome = await fs.mkdtemp(path.join(os.tmpdir(), 'project-ctx-home-'));
  originalHome = process.env.HOME;
  process.env.HOME = stateHome;
  process.env.PROJECT_ROOT = tmpA;
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = undefined;
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  delete process.env.PROJECT_ROOT;
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = undefined;
  await fs.rm(tmpA, { recursive: true, force: true });
  await fs.rm(tmpB, { recursive: true, force: true });
  await fs.rm(stateHome, { recursive: true, force: true });
});

describe('project-context', () => {
  it('initializes from PROJECT_ROOT env var', async () => {
    const mod = await loadModule();
    expect(mod.getActiveRoot()).toBe(path.resolve(tmpA));
  });

  it('setActiveRoot switches root and updates recents', async () => {
    const mod = await loadModule();
    mod.setActiveRoot(tmpB);
    expect(mod.getActiveRoot()).toBe(path.resolve(tmpB));
    const recents = mod.getRecents();
    expect(recents[0]).toBe(path.resolve(tmpB));
    expect(recents).toContain(path.resolve(tmpA));
  });

  it('onActiveRootChange fires listeners on change', async () => {
    const mod = await loadModule();
    const seen: string[] = [];
    const unsubscribe = mod.onActiveRootChange((root: string) => seen.push(root));
    mod.setActiveRoot(tmpB);
    expect(seen).toEqual([path.resolve(tmpB)]);
    unsubscribe();
    mod.setActiveRoot(tmpA);
    expect(seen).toEqual([path.resolve(tmpB)]);
  });

  it('rejects relative paths', async () => {
    const mod = await loadModule();
    expect(() => mod.setActiveRoot('relative/path')).toThrow(/absolute/);
  });

  it('rejects non-existent paths', async () => {
    const mod = await loadModule();
    expect(() => mod.setActiveRoot('/this/path/does/not/exist/claudegui')).toThrow(/exist/);
  });

  it('rejects filesystem root', async () => {
    const mod = await loadModule();
    const fsRoot = path.parse(tmpA).root;
    expect(() => mod.setActiveRoot(fsRoot)).toThrow(/root/);
  });

  it('rejects home directory', async () => {
    const mod = await loadModule();
    expect(() => mod.setActiveRoot(os.homedir())).toThrow(/home/i);
  });

  it('rejects file paths (not directories)', async () => {
    const mod = await loadModule();
    const filePath = path.join(tmpA, 'file.txt');
    await fs.writeFile(filePath, 'hi');
    expect(() => mod.setActiveRoot(filePath)).toThrow(/directory/);
  });

  it('persists state to ~/.claudegui/state.json', async () => {
    const mod = await loadModule();
    mod.setActiveRoot(tmpB);
    const stateFile = path.join(stateHome, '.claudegui', 'state.json');
    const raw = await fs.readFile(stateFile, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.lastRoot).toBe(path.resolve(tmpB));
    expect(parsed.recents).toContain(path.resolve(tmpB));
  });
});
