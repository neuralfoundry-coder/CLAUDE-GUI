import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpHome: string;

beforeAll(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'claudegui-home-'));
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);

  const projectDir = path.join(tmpHome, '.claude', 'projects', '-Users-test-project');
  await fs.mkdir(projectDir, { recursive: true });

  const sessionId = 'aaa-bbb-ccc';
  const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);
  const lines = [
    { type: 'queue-operation', operation: 'dequeue', sessionId },
    {
      type: 'user',
      sessionId,
      uuid: 'u1',
      timestamp: '2026-04-11T00:00:00.000Z',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    },
    {
      type: 'assistant',
      sessionId,
      uuid: 'a1',
      timestamp: '2026-04-11T00:00:01.000Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hi!' },
          { type: 'tool_use', name: 'Read', input: { file_path: '/x' } },
        ],
      },
    },
    {
      type: 'assistant',
      sessionId,
      uuid: 'a2',
      timestamp: '2026-04-11T00:00:02.000Z',
      total_cost_usd: 0.0123,
    },
  ];
  await fs.writeFile(sessionFile, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
});

afterAll(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe('session-discovery', () => {
  it('discovers sessions with metadata', async () => {
    const { discoverSessions } = await import('@/lib/claude/session-discovery');
    const sessions = await discoverSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe('aaa-bbb-ccc');
    expect(sessions[0]!.messageCount).toBe(3);
    expect(sessions[0]!.totalCost).toBeCloseTo(0.0123);
  });

  it('loads session history with text and tool_use blocks', async () => {
    const { getSessionHistory } = await import('@/lib/claude/session-discovery');
    const history = await getSessionHistory('aaa-bbb-ccc');
    // user text + assistant text + tool_use block (assistant without content skipped)
    const roles = history.map((h) => h.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
    expect(roles).toContain('tool');
    const toolEntry = history.find((h) => h.role === 'tool');
    expect(toolEntry?.toolName).toBe('Read');
    const userEntry = history.find((h) => h.role === 'user');
    expect(userEntry?.content).toBe('Hello');
  });

  it('returns null for non-existent session', async () => {
    const { getSession } = await import('@/lib/claude/session-discovery');
    const s = await getSession('nonexistent-id');
    expect(s).toBeNull();
  });
});
