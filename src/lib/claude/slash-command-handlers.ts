'use client';

/**
 * Client-side handlers for slash commands added in the CLI-parity update.
 *
 * Each function accepts a `push` callback that injects a system message into
 * the chat, and optionally extra arguments parsed from the user input.
 */

import { useConnectionStore } from '@/stores/use-connection-store';
import { useClaudeStore } from '@/stores/use-claude-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { useSettingsStore } from '@/stores/use-settings-store';
import { useMcpStore } from '@/stores/use-mcp-store';

type PushFn = (content: string) => void;

// ─── Helpers ──────────────────────────────────────────────

async function fetchJson<T = unknown>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

// ─── /bug ─────────────────────────────────────────────────

export function handleBug(push: PushFn): void {
  const url = 'https://github.com/anthropics/claude-code/issues';
  window.open(url, '_blank', 'noopener');
  push(
    [
      '**Bug Report**',
      '',
      `Opened the [GitHub Issues page](${url}) in a new tab.`,
      'Please describe the issue and submit it there.',
    ].join('\n'),
  );
}

// ─── /config ──────────────────────────────────────────────

export async function handleConfig(push: PushFn): Promise<void> {
  const data = await fetchJson<{
    settings: Record<string, unknown>;
    normalized: { allowedTools: string[]; deniedTools: string[]; allowedBashCommands: string[] };
  }>('/api/settings');

  if (!data) {
    push('Failed to load configuration. Is a project open?');
    return;
  }

  const { settings, normalized } = data;
  const model = useSettingsStore.getState().selectedModel ?? 'auto';
  const mcpServers = settings.mcpServers
    ? Object.keys(settings.mcpServers as Record<string, unknown>)
    : [];

  const lines = [
    '**Configuration**',
    '',
    `- **Model:** \`${model}\``,
    `- **Allowed tools:** ${normalized.allowedTools.length > 0 ? normalized.allowedTools.map((t) => `\`${t}\``).join(', ') : '_none_'}`,
    `- **Denied tools:** ${normalized.deniedTools.length > 0 ? normalized.deniedTools.map((t) => `\`${t}\``).join(', ') : '_none_'}`,
    `- **Allowed bash commands:** ${normalized.allowedBashCommands.length > 0 ? normalized.allowedBashCommands.map((c) => `\`${c}\``).join(', ') : '_none_'}`,
    `- **MCP servers:** ${mcpServers.length > 0 ? mcpServers.map((s) => `\`${s}\``).join(', ') : '_none_'}`,
    '',
    'Edit configuration in `.claude/settings.json` or use the Permission Rules modal (`Cmd+K` → "Edit Permission Rules").',
  ];
  push(lines.join('\n'));
}

// ─── /doctor ──────────────────────────────────────────────

export async function handleDoctor(push: PushFn): Promise<void> {
  push('Running diagnostics…');

  const [health, auth, mcp] = await Promise.all([
    fetchJson<{ status: string; uptime: number }>('/api/health'),
    fetchJson<{
      authenticated: boolean;
      source: string;
      cliInstalled: boolean;
      email?: string;
    }>('/api/auth/status'),
    fetchJson<{ statuses: Array<{ name: string; status: string }> }>('/api/mcp/status'),
  ]);

  const wsStatuses = useConnectionStore.getState().statuses;
  const check = (ok: boolean) => (ok ? '✅' : '❌');

  const lines = [
    '**Health Diagnostics**',
    '',
    '| Check | Status |',
    '|-------|--------|',
    `| Server | ${check(health?.status === 'ok')} ${health ? `up ${Math.round(health.uptime)}s` : 'unreachable'} |`,
    `| Claude CLI installed | ${check(auth?.cliInstalled ?? false)} |`,
    `| Authenticated | ${check(auth?.authenticated ?? false)} ${auth?.source ? `(${auth.source})` : ''} ${auth?.email ? `— ${auth.email}` : ''} |`,
    `| WebSocket (claude) | ${check(wsStatuses.claude === 'open')} ${wsStatuses.claude} |`,
    `| WebSocket (terminal) | ${check(wsStatuses.terminal === 'open')} ${wsStatuses.terminal} |`,
    `| WebSocket (files) | ${check(wsStatuses.files === 'open')} ${wsStatuses.files} |`,
    `| MCP servers | ${check(true)} ${mcp?.statuses?.length ?? 0} configured |`,
  ];

  if (mcp?.statuses && mcp.statuses.length > 0) {
    lines.push('', '**MCP Server Details:**');
    for (const s of mcp.statuses) {
      lines.push(`- \`${s.name}\`: ${s.status}`);
    }
  }

  push(lines.join('\n'));
}

// ─── /login ───────────────────────────────────────────────

export async function handleLogin(push: PushFn): Promise<void> {
  const auth = await fetchJson<{
    authenticated: boolean;
    email?: string;
    source?: string;
  }>('/api/auth/status');

  if (auth?.authenticated) {
    push(
      [
        '**Already signed in**',
        '',
        `- **Email:** ${auth.email ?? '_unknown_'}`,
        `- **Source:** ${auth.source ?? '_unknown_'}`,
        '',
        'To switch accounts, run `/logout` first.',
      ].join('\n'),
    );
    return;
  }

  push(
    [
      '**Sign In**',
      '',
      'Run the following command in the terminal panel to sign in:',
      '',
      '```',
      'claude login',
      '```',
      '',
      'Use `Ctrl+Cmd+J` to open the terminal panel.',
    ].join('\n'),
  );
}

// ─── /logout ──────────────────────────────────────────────

export async function handleLogout(push: PushFn): Promise<void> {
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      push('**Signed out** successfully. Run `/login` to sign in again.');
    } else {
      push(`**Logout failed:** ${json.error ?? 'Unknown error'}`);
    }
  } catch (err) {
    push(`**Logout failed:** ${String(err)}`);
  }
}

// ─── /status ──────────────────────────────────────────────

export async function handleStatus(push: PushFn): Promise<void> {
  const [auth, project, health] = await Promise.all([
    fetchJson<{
      authenticated: boolean;
      source: string;
      cliInstalled: boolean;
      email?: string;
      orgName?: string;
    }>('/api/auth/status'),
    fetchJson<{ root: string | null; recents: string[] }>('/api/project'),
    fetchJson<{ status: string; uptime: number }>('/api/health'),
  ]);

  const sid = useClaudeStore.getState().activeSessionId;
  const stats = sid ? useClaudeStore.getState().sessionStats[sid] : null;
  const model = useSettingsStore.getState().selectedModel ?? stats?.model ?? 'auto';
  const wsStatuses = useConnectionStore.getState().statuses;

  const lines = [
    '**Status**',
    '',
    '**Account:**',
    `- Authenticated: ${auth?.authenticated ? 'Yes' : 'No'}${auth?.email ? ` (${auth.email})` : ''}`,
    `- Auth source: ${auth?.source ?? 'none'}`,
    ...(auth?.orgName ? [`- Organization: ${auth.orgName}`] : []),
    '',
    '**Session:**',
    `- Session ID: ${sid ? `\`${sid.slice(0, 12)}…\`` : '_none_'}`,
    `- Model: \`${model}\``,
    `- Cost: $${(stats?.costUsd ?? 0).toFixed(4)}`,
    `- Turns: ${stats?.numTurns ?? 0}`,
    '',
    '**Project:**',
    `- Root: \`${project?.root ?? '_not set_'}\``,
    '',
    '**Server:**',
    `- Uptime: ${health ? `${Math.round(health.uptime)}s` : '_unknown_'}`,
    `- WebSocket: claude=${wsStatuses.claude}, terminal=${wsStatuses.terminal}, files=${wsStatuses.files}`,
  ];
  push(lines.join('\n'));
}

// ─── /vim ─────────────────────────────────────────────────

export function handleVim(push: PushFn): void {
  const current = useSettingsStore.getState().editorVimMode;
  useSettingsStore.getState().setEditorVimMode(!current);
  push(
    `**Vim mode ${!current ? 'enabled' : 'disabled'}.**\n\nRefresh the editor tab to apply. Toggle again with \`/vim\`.`,
  );
}

// ─── /terminal-setup ──────────────────────────────────────

export function handleTerminalSetup(push: PushFn): void {
  push(
    [
      '**Terminal Integration**',
      '',
      'ClaudeGUI has a built-in terminal panel — no additional setup is needed.',
      '',
      '- **Toggle terminal:** `Ctrl+Cmd+J` / `Ctrl+Alt+J`',
      '- **New session:** Right-click tab → New Session',
      '- **Open native terminal:** Command Palette (`Cmd+K`) → "Open in Native Terminal"',
    ].join('\n'),
  );
}

// ─── /permissions ─────────────────────────────────────────

export async function handlePermissions(push: PushFn): Promise<void> {
  const data = await fetchJson<{
    settings: Record<string, unknown>;
    normalized: { allowedTools: string[]; deniedTools: string[]; allowedBashCommands: string[] };
  }>('/api/settings');

  if (!data) {
    push('Failed to load permissions. Is a project open?');
    return;
  }

  const { normalized } = data;
  const lines = [
    '**Tool Permissions**',
    '',
    '**Allowed tools:**',
    ...(normalized.allowedTools.length > 0
      ? normalized.allowedTools.map((t) => `- \`${t}\``)
      : ['- _none_']),
    '',
    '**Denied tools:**',
    ...(normalized.deniedTools.length > 0
      ? normalized.deniedTools.map((t) => `- \`${t}\``)
      : ['- _none_']),
    '',
    '**Allowed bash commands:**',
    ...(normalized.allowedBashCommands.length > 0
      ? normalized.allowedBashCommands.map((c) => `- \`${c}\``)
      : ['- _none_']),
    '',
    'Open the Permission Rules modal with `Cmd+K` → "Edit Permission Rules".',
  ];
  push(lines.join('\n'));

  // Also open the rules modal
  useSettingsStore.getState().openRulesModal();
}

// ─── /approved-tools ──────────────────────────────────────

export async function handleApprovedTools(push: PushFn): Promise<void> {
  const data = await fetchJson<{
    normalized: { allowedTools: string[]; deniedTools: string[]; allowedBashCommands: string[] };
  }>('/api/settings');

  if (!data) {
    push('Failed to load approved tools. Is a project open?');
    return;
  }

  const { normalized } = data;
  const all = [
    ...normalized.allowedTools.map((t) => `\`${t}\``),
    ...normalized.allowedBashCommands.map((c) => `\`Bash(${c})\``),
  ];

  const lines = [
    '**Approved Tools**',
    '',
    ...(all.length > 0 ? all.map((t) => `- ${t}`) : ['_No tools approved yet._']),
    '',
    'Manage via `.claude/settings.json` or the Permission Rules modal.',
  ];
  push(lines.join('\n'));
}

// ─── /mcp ─────────────────────────────────────────────────

export async function handleMcp(push: PushFn): Promise<void> {
  // Refresh data
  await Promise.all([
    useMcpStore.getState().fetchServers(),
    useMcpStore.getState().fetchStatus(),
  ]);

  const { servers, statuses } = useMcpStore.getState();
  const serverNames = Object.keys(servers);

  if (serverNames.length === 0 && statuses.length === 0) {
    push(
      [
        '**MCP Servers**',
        '',
        '_No MCP servers configured._',
        '',
        'Add servers via `Cmd+K` → "MCP: Manage Servers" or edit `.claude/settings.json`.',
      ].join('\n'),
    );
    useMcpStore.getState().openModal();
    return;
  }

  const lines = [
    '**MCP Servers**',
    '',
    '| Server | Enabled | Status |',
    '|--------|---------|--------|',
  ];

  for (const name of serverNames) {
    const entry = servers[name]!;
    const statusInfo = statuses.find((s) => s.name === name);
    lines.push(
      `| \`${name}\` | ${entry.enabled ? '✅' : '❌'} | ${statusInfo?.status ?? '_unknown_'} |`,
    );
  }

  // Show runtime statuses for servers not in config (e.g., built-in)
  for (const s of statuses) {
    if (!serverNames.includes(s.name)) {
      lines.push(`| \`${s.name}\` | — | ${s.status} |`);
    }
  }

  lines.push('', 'Open the MCP Servers modal with `Cmd+K` → "MCP: Manage Servers".');
  push(lines.join('\n'));

  useMcpStore.getState().openModal();
}

// ─── /memory ──────────────────────────────────────────────

export async function handleMemory(push: PushFn): Promise<void> {
  const project = await fetchJson<{ root: string | null }>('/api/project');
  const root = project?.root;

  if (!root) {
    push('No project is open. Use `/init` to initialize a project first.');
    return;
  }

  const claudeMdPath = `${root}/CLAUDE.md`;

  // Check if file exists
  try {
    const res = await fetch(`/api/files/stat?path=${encodeURIComponent(claudeMdPath)}`);
    const json = await res.json();
    if (!json.success) {
      push(
        [
          '**CLAUDE.md not found**',
          '',
          `No \`CLAUDE.md\` exists at \`${root}\`.`,
          'Use `/init` to create one, or create it manually.',
        ].join('\n'),
      );
      return;
    }
  } catch {
    push('Failed to check CLAUDE.md. Is the project root accessible?');
    return;
  }

  // Open in editor
  await useEditorStore.getState().openFile(claudeMdPath);
  push(`Opened \`CLAUDE.md\` in the editor.`);
}

// ─── /add-dir ─────────────────────────────────────────────

export async function handleAddDir(push: PushFn, args: string): Promise<void> {
  const dirPath = args.trim();
  if (!dirPath) {
    push(
      [
        '**Usage:** `/add-dir <path>`',
        '',
        'Add a directory to the project context.',
        'Example: `/add-dir ../other-project`',
      ].join('\n'),
    );
    return;
  }

  try {
    const res = await fetch('/api/project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dirPath }),
    });
    const json = await res.json();
    if (json.success) {
      push(`Added directory \`${json.data.root}\` to project context.`);
    } else {
      push(`**Failed to add directory:** ${json.error ?? 'Unknown error'}`);
    }
  } catch (err) {
    push(`**Failed to add directory:** ${String(err)}`);
  }
}
