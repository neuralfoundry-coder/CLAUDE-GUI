import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getActiveRoot } from '@/lib/project/project-context.mjs';

export interface McpStdioServerConfig {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpSSEServerConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface McpHttpServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig;

export interface McpServerEntry {
  enabled: boolean;
  description?: string;
  config: McpServerConfig;
}

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
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

function settingsFilePath(projectRoot?: string | null): string | null {
  const root = projectRoot || getActiveRoot();
  if (!root) return null;
  return path.join(root, '.claude', 'settings.json');
}

export async function loadSettings(projectRoot?: string | null): Promise<ClaudeSettings> {
  const p = settingsFilePath(projectRoot);
  if (!p) return {};
  try {
    const content = await fs.readFile(p, 'utf-8');
    return JSON.parse(content) as ClaudeSettings;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

export async function saveSettings(settings: ClaudeSettings, projectRoot?: string | null): Promise<void> {
  const p = settingsFilePath(projectRoot);
  if (!p) throw new Error('No project is open');
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

export function matchBashPattern(command: string, pattern: string): boolean {
  if (typeof command !== 'string' || typeof pattern !== 'string') return false;
  const cmd = command.trim();
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -2).trim();
    if (!prefix) return false;
    return cmd === prefix || cmd.startsWith(prefix + ' ');
  }
  return cmd === pattern.trim();
}

export function buildAllowRuleForInput(toolName: string, input: unknown): string {
  if (toolName === 'Bash') {
    const cmd =
      input && typeof input === 'object' && typeof (input as { command?: unknown }).command === 'string'
        ? ((input as { command: string }).command).trim()
        : '';
    if (!cmd) return 'Bash';
    const firstToken = cmd.split(/\s+/)[0] || cmd;
    return `Bash(${firstToken}:*)`;
  }
  return toolName;
}
