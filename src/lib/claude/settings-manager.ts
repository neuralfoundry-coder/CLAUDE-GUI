import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getProjectRoot } from '@/lib/fs/resolve-safe';

export interface ClaudeSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
    ask?: string[];
  };
  autoApprove?: {
    tools?: string[];
    bashCommands?: string[];
  };
  [key: string]: unknown;
}

function settingsFilePath(): string {
  return path.join(getProjectRoot(), '.claude', 'settings.json');
}

export async function loadSettings(): Promise<ClaudeSettings> {
  const p = settingsFilePath();
  try {
    const content = await fs.readFile(p, 'utf-8');
    return JSON.parse(content) as ClaudeSettings;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

export async function saveSettings(settings: ClaudeSettings): Promise<void> {
  const p = settingsFilePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

export function normalizeRules(settings: ClaudeSettings): {
  allowedTools: string[];
  deniedTools: string[];
  allowedBashCommands: string[];
} {
  const allowedTools = new Set<string>();
  const deniedTools = new Set<string>();
  const allowedBashCommands = new Set<string>();

  for (const entry of settings.permissions?.allow ?? []) {
    const m = entry.match(/^([A-Za-z]+)(?:\((.*)\))?$/);
    if (!m) continue;
    const [, tool, arg] = m;
    if (!tool) continue;
    if (tool === 'Bash' && arg) allowedBashCommands.add(arg);
    else allowedTools.add(tool);
  }
  for (const entry of settings.permissions?.deny ?? []) {
    const m = entry.match(/^([A-Za-z]+)/);
    if (m && m[1]) deniedTools.add(m[1]);
  }
  // Legacy shape from settings.autoApprove
  for (const t of settings.autoApprove?.tools ?? []) allowedTools.add(t);
  for (const c of settings.autoApprove?.bashCommands ?? []) allowedBashCommands.add(c);

  return {
    allowedTools: Array.from(allowedTools).sort(),
    deniedTools: Array.from(deniedTools).sort(),
    allowedBashCommands: Array.from(allowedBashCommands).sort(),
  };
}
