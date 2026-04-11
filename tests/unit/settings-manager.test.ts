import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { normalizeRules } from '@/lib/claude/settings-manager';

describe('normalizeRules', () => {
  it('extracts tool and bash command rules from permissions.allow', () => {
    const result = normalizeRules({
      permissions: {
        allow: ['Bash(npm test:*)', 'Edit', 'Bash(ls:*)', 'Read'],
      },
    });
    expect(result.allowedTools).toEqual(['Edit', 'Read']);
    expect(result.allowedBashCommands).toContain('npm test:*');
    expect(result.allowedBashCommands).toContain('ls:*');
  });

  it('extracts denied tools', () => {
    const result = normalizeRules({
      permissions: { deny: ['Bash', 'Write'] },
    });
    expect(result.deniedTools).toEqual(['Bash', 'Write']);
  });

  it('merges legacy autoApprove fields', () => {
    const result = normalizeRules({
      autoApprove: { tools: ['Edit'], bashCommands: ['pwd'] },
    });
    expect(result.allowedTools).toEqual(['Edit']);
    expect(result.allowedBashCommands).toEqual(['pwd']);
  });

  it('returns empty arrays when no rules present', () => {
    const result = normalizeRules({});
    expect(result.allowedTools).toEqual([]);
    expect(result.deniedTools).toEqual([]);
    expect(result.allowedBashCommands).toEqual([]);
  });
});

describe('settings persistence', () => {
  let originalRoot: string | undefined;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claudegui-settings-'));
    originalRoot = process.env.PROJECT_ROOT;
    process.env.PROJECT_ROOT = tmpDir;
  });

  afterEach(async () => {
    if (originalRoot !== undefined) process.env.PROJECT_ROOT = originalRoot;
    else delete process.env.PROJECT_ROOT;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('saves and loads settings', async () => {
    const { loadSettings, saveSettings } = await import('@/lib/claude/settings-manager');
    await saveSettings({ permissions: { allow: ['Read'] } });
    const loaded = await loadSettings();
    expect(loaded.permissions?.allow).toEqual(['Read']);

    const filePath = path.join(tmpDir, '.claude', 'settings.json');
    const stat = await fs.stat(filePath);
    expect(stat.isFile()).toBe(true);
  });

  it('returns empty object when file does not exist', async () => {
    const { loadSettings } = await import('@/lib/claude/settings-manager');
    const loaded = await loadSettings();
    expect(loaded).toEqual({});
  });
});
