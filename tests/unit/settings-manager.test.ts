import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { normalizeRules, matchBashPattern, buildAllowRuleForInput } from '@/lib/claude/settings-manager';

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

describe('matchBashPattern', () => {
  it('matches prefix patterns with :*', () => {
    expect(matchBashPattern('npm test', 'npm test:*')).toBe(true);
    expect(matchBashPattern('npm test -- foo', 'npm test:*')).toBe(true);
    expect(matchBashPattern('npm install', 'npm test:*')).toBe(false);
  });

  it('matches exact patterns without :*', () => {
    expect(matchBashPattern('pwd', 'pwd')).toBe(true);
    expect(matchBashPattern('pwd -L', 'pwd')).toBe(false);
  });

  it('handles whitespace gracefully', () => {
    expect(matchBashPattern('  ls -la  ', 'ls:*')).toBe(true);
  });

  it('rejects empty prefix patterns', () => {
    expect(matchBashPattern('anything', ':*')).toBe(false);
  });
});

describe('buildAllowRuleForInput', () => {
  it('returns the tool name for non-Bash tools', () => {
    expect(buildAllowRuleForInput('Write', { file_path: '/tmp/x.html' })).toBe('Write');
    expect(buildAllowRuleForInput('Edit', null)).toBe('Edit');
  });

  it('returns Bash(<first-token>:*) for Bash input', () => {
    expect(buildAllowRuleForInput('Bash', { command: 'npm test -- --reporter=json' })).toBe(
      'Bash(npm:*)',
    );
    expect(buildAllowRuleForInput('Bash', { command: 'ls -la' })).toBe('Bash(ls:*)');
  });

  it('falls back to Bash when command is missing', () => {
    expect(buildAllowRuleForInput('Bash', {})).toBe('Bash');
    expect(buildAllowRuleForInput('Bash', null)).toBe('Bash');
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
