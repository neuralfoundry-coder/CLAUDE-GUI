import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

export interface DiscoveredSession {
  id: string;
  name: string;
  cwd: string;
  createdAt: string;
  lastUsedAt: string;
  totalCost: number;
  messageCount: number;
}

export interface SessionHistoryMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
}

interface JsonlEntry {
  type?: string;
  sessionId?: string;
  uuid?: string;
  timestamp?: string;
  message?: {
    role?: 'user' | 'assistant';
    content?: Array<{ type: string; text?: string; name?: string; input?: unknown }> | string;
  };
  cost_usd?: number;
  total_cost_usd?: number;
}

function claudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

function encodedToPath(encoded: string): string {
  return '/' + encoded.replace(/^-/, '').replace(/-/g, '/');
}

async function readJsonlLines(filePath: string): Promise<JsonlEntry[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const entries: JsonlEntry[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        /* skip malformed lines */
      }
    }
    return entries;
  } catch {
    return [];
  }
}

async function readJsonlMetadata(
  filePath: string,
): Promise<{ messageCount: number; cost: number }> {
  const entries = await readJsonlLines(filePath);
  let messageCount = 0;
  let cost = 0;
  for (const entry of entries) {
    if (entry.type === 'user' || entry.type === 'assistant') messageCount += 1;
    if (typeof entry.total_cost_usd === 'number') cost += entry.total_cost_usd;
    else if (typeof entry.cost_usd === 'number') cost += entry.cost_usd;
  }
  return { messageCount, cost };
}

export async function discoverSessions(): Promise<DiscoveredSession[]> {
  const base = claudeProjectsDir();
  let dirents;
  try {
    dirents = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }

  const sessions: DiscoveredSession[] = [];
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const projectDir = path.join(base, d.name);
    let files;
    try {
      files = await fs.readdir(projectDir);
    } catch {
      continue;
    }
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
    for (const f of jsonlFiles) {
      const full = path.join(projectDir, f);
      try {
        const stat = await fs.stat(full);
        const meta = await readJsonlMetadata(full);
        sessions.push({
          id: f.replace(/\.jsonl$/, ''),
          name: f.replace(/\.jsonl$/, '').slice(0, 12),
          cwd: encodedToPath(d.name),
          createdAt: stat.birthtime.toISOString(),
          lastUsedAt: stat.mtime.toISOString(),
          totalCost: meta.cost,
          messageCount: meta.messageCount,
        });
      } catch {
        continue;
      }
    }
  }

  sessions.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  return sessions;
}

export async function getSession(id: string): Promise<DiscoveredSession | null> {
  const all = await discoverSessions();
  return all.find((s) => s.id === id) ?? null;
}

export async function getSessionHistory(id: string): Promise<SessionHistoryMessage[]> {
  const base = claudeProjectsDir();
  let dirents;
  try {
    dirents = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const file = path.join(base, d.name, `${id}.jsonl`);
    try {
      await fs.access(file);
    } catch {
      continue;
    }

    const entries = await readJsonlLines(file);
    const messages: SessionHistoryMessage[] = [];
    let counter = 0;
    for (const entry of entries) {
      if (entry.type !== 'user' && entry.type !== 'assistant') continue;
      const content = entry.message?.content;
      const ts = entry.timestamp ? Date.parse(entry.timestamp) : Date.now();
      counter += 1;

      if (typeof content === 'string') {
        messages.push({
          id: `${entry.uuid ?? id}-${counter}`,
          role: entry.type,
          content,
          timestamp: ts,
        });
        continue;
      }
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          messages.push({
            id: `${entry.uuid ?? id}-${counter}-t`,
            role: entry.type,
            content: block.text,
            timestamp: ts,
          });
        } else if (block.type === 'tool_use') {
          messages.push({
            id: `${entry.uuid ?? id}-${counter}-u`,
            role: 'tool',
            toolName: block.name ?? 'unknown',
            content: JSON.stringify(block.input ?? {}).slice(0, 300),
            timestamp: ts,
          });
        }
        // tool_result blocks are omitted from UI
      }
    }
    return messages;
  }
  return [];
}

export async function deleteSession(id: string): Promise<boolean> {
  const base = claudeProjectsDir();
  let dirents;
  try {
    dirents = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const file = path.join(base, d.name, `${id}.jsonl`);
    try {
      await fs.unlink(file);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}
