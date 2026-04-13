import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getActiveRoot } from '../project/project-context.mjs';

function settingsFilePath(projectRoot) {
  const root = projectRoot || getActiveRoot();
  if (!root) return null;
  return path.join(root, '.claude', 'settings.json');
}

export async function loadSettings(projectRoot) {
  const p = settingsFilePath(projectRoot);
  if (!p) return {};
  try {
    const content = await fs.readFile(p, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    throw err;
  }
}

export async function saveSettings(settings, projectRoot) {
  const p = settingsFilePath(projectRoot);
  if (!p) throw new Error('No project is open');
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

export function normalizeRules(settings) {
  const allowedTools = new Set();
  const deniedTools = new Set();
  const allowedBashCommands = new Set();

  for (const entry of settings?.permissions?.allow ?? []) {
    const m = entry.match(/^([A-Za-z]+)(?:\((.*)\))?$/);
    if (!m) continue;
    const [, tool, arg] = m;
    if (!tool) continue;
    if (tool === 'Bash' && arg) allowedBashCommands.add(arg);
    else allowedTools.add(tool);
  }
  for (const entry of settings?.permissions?.deny ?? []) {
    const m = entry.match(/^([A-Za-z]+)/);
    if (m && m[1]) deniedTools.add(m[1]);
  }
  for (const t of settings?.autoApprove?.tools ?? []) allowedTools.add(t);
  for (const c of settings?.autoApprove?.bashCommands ?? []) allowedBashCommands.add(c);

  return {
    allowedTools: Array.from(allowedTools).sort(),
    deniedTools: Array.from(deniedTools).sort(),
    allowedBashCommands: Array.from(allowedBashCommands).sort(),
  };
}

export function matchBashPattern(command, pattern) {
  if (typeof command !== 'string' || typeof pattern !== 'string') return false;
  const cmd = command.trim();
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -2).trim();
    if (!prefix) return false;
    return cmd === prefix || cmd.startsWith(prefix + ' ');
  }
  return cmd === pattern.trim();
}

export function isToolAllowedBySettings(toolName, input, rules) {
  if (!rules) return false;
  if (rules.deniedTools.includes(toolName)) return false;
  if (toolName === 'Bash') {
    const cmd = input && typeof input.command === 'string' ? input.command : '';
    return rules.allowedBashCommands.some((pat) => matchBashPattern(cmd, pat));
  }
  return rules.allowedTools.includes(toolName);
}

export function isToolDeniedBySettings(toolName, rules) {
  if (!rules) return false;
  return rules.deniedTools.includes(toolName);
}

export function buildAllowRuleForInput(toolName, input) {
  if (toolName === 'Bash') {
    const cmd = input && typeof input.command === 'string' ? input.command.trim() : '';
    if (!cmd) return 'Bash';
    const firstToken = cmd.split(/\s+/)[0] || cmd;
    return `Bash(${firstToken}:*)`;
  }
  return toolName;
}
