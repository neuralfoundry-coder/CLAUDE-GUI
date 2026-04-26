/**
 * Slash command registry for the Claude chat panel.
 *
 * Commands are split into three categories:
 * - `client`: handled entirely on the frontend (GUI shell semantics —
 *   e.g. /clear empties the chat tab, /memory opens CLAUDE.md in the editor)
 * - `cli`: forwarded to the local `claude` binary via `POST /api/claude/cli`
 *   so that real CLI behavior (model/effort/status/usage/etc.) is preserved
 *   instead of being faked by the GUI
 * - `passthrough` (legacy): the entire input is sent as a prompt through the
 *   active Agent SDK session — kept for completeness but most former
 *   passthrough entries have migrated to `cli` since the SDK does not
 *   interpret slash commands itself
 */

export interface SlashCommand {
  /** The slash-prefixed name (e.g. "/clear"). */
  name: string;
  /** One-line description shown in the popover. */
  description: string;
  /** Grouping label in the popover. */
  category: 'session' | 'info' | 'mode' | 'system' | 'tools' | 'project';
  /**
   * - `client`      — handled by the GUI without sending to Claude CLI.
   * - `cli`         — spawns `claude --print '<command>'` server-side and
   *                   renders the captured output as a system message.
   * - `passthrough` — sends the entire input line through the active Agent
   *                   SDK session as a prompt (legacy).
   */
  handler: 'client' | 'cli' | 'passthrough';
  /** Optional aliases that also trigger this command. */
  aliases?: string[];
  /**
   * For passthrough commands: whether an active session is required.
   * - `true` (default for passthrough): block execution if no session exists.
   * - `false`: allow execution even without a session (a new session will be created).
   * Ignored for client commands.
   */
  requiresSession?: boolean;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // ── Session ────────────────────────────────────────────
  {
    name: '/clear',
    description: 'Clear chat and start fresh',
    category: 'session',
    handler: 'client',
  },
  {
    name: '/new',
    description: 'Start a new Claude session',
    category: 'session',
    handler: 'client',
    aliases: ['/reset'],
  },
  {
    name: '/compact',
    description: 'Compact conversation context (CLI)',
    category: 'session',
    handler: 'cli',
  },

  // ── Info ────────────────────────────────────────────────
  {
    name: '/usage',
    description: 'Show token usage from Claude CLI',
    category: 'info',
    handler: 'cli',
  },
  {
    name: '/context',
    description: 'Show context window usage (CLI)',
    category: 'info',
    handler: 'cli',
  },
  {
    name: '/cost',
    description: 'Show session cost breakdown (CLI)',
    category: 'info',
    handler: 'cli',
  },
  {
    name: '/model',
    description: 'Show or change Claude model (CLI)',
    category: 'info',
    handler: 'cli',
  },
  {
    name: '/effort',
    description: 'Show or change reasoning effort level (CLI)',
    category: 'info',
    handler: 'cli',
  },
  {
    name: '/help',
    description: 'Show available slash commands (GUI registry)',
    category: 'info',
    handler: 'client',
  },

  // ── Mode ───────────────────────────────────────────────
  {
    name: '/plan',
    description: 'Ask Claude to create a plan before coding (CLI)',
    category: 'mode',
    handler: 'cli',
  },
  {
    name: '/review',
    description: 'Ask Claude to review current changes (CLI)',
    category: 'mode',
    handler: 'cli',
  },

  // ── System ─────────────────────────────────────────────
  {
    name: '/bug',
    description: 'Report a bug or submit feedback',
    category: 'system',
    handler: 'client',
  },
  {
    name: '/config',
    description: 'Show CLI configuration',
    category: 'system',
    handler: 'cli',
  },
  {
    name: '/doctor',
    description: 'Run CLI diagnostics',
    category: 'system',
    handler: 'cli',
  },
  {
    name: '/login',
    description: 'Sign in to Claude',
    category: 'system',
    handler: 'client',
  },
  {
    name: '/logout',
    description: 'Sign out of Claude',
    category: 'system',
    handler: 'client',
  },
  {
    name: '/status',
    description: 'Show CLI comprehensive status',
    category: 'system',
    handler: 'cli',
  },
  {
    name: '/vim',
    description: 'Toggle vim keybindings in editor',
    category: 'system',
    handler: 'client',
  },
  {
    name: '/terminal-setup',
    description: 'Terminal integration info',
    category: 'system',
    handler: 'client',
  },

  // ── Tools ──────────────────────────────────────────────
  {
    name: '/permissions',
    description: 'View/manage tool permissions',
    category: 'tools',
    handler: 'client',
  },
  {
    name: '/approved-tools',
    description: 'Show approved tools list',
    category: 'tools',
    handler: 'client',
  },
  {
    name: '/mcp',
    description: 'View MCP server status',
    category: 'tools',
    handler: 'client',
  },

  // ── Project ────────────────────────────────────────────
  {
    name: '/init',
    description: 'Initialize CLAUDE.md in project (CLI)',
    category: 'project',
    handler: 'cli',
  },
  {
    name: '/memory',
    description: 'Open CLAUDE.md in editor',
    category: 'project',
    handler: 'client',
  },
  {
    name: '/pr-comments',
    description: 'View pull request comments (CLI)',
    category: 'project',
    handler: 'cli',
  },
  {
    name: '/add-dir',
    description: 'Add directory to context',
    category: 'project',
    handler: 'client',
  },
];

const CATEGORY_LABELS: Record<SlashCommand['category'], string> = {
  session: 'Session',
  info: 'Info',
  mode: 'Mode',
  system: 'System',
  tools: 'Tools',
  project: 'Project',
};

export function getCategoryLabel(category: SlashCommand['category']): string {
  return CATEGORY_LABELS[category];
}

/**
 * Detect whether the current input is a slash command trigger.
 * Returns the query portion (everything after `/`) or `null` if not a trigger.
 *
 * A slash command is detected when:
 * - The input starts with `/`
 * - There is at most one word (no space after the command name, or the input
 *   is just `/` with optional partial command name)
 */
export function detectSlashCommand(input: string): string | null {
  if (!input.startsWith('/')) return null;
  // Allow filtering while typing the command name (no space yet)
  // e.g. "/cl" → "cl", "/compact" → "compact", "/" → ""
  // Once there's a space, it's no longer a trigger for the popover
  // (but can still be executed as a command)
  const firstSpace = input.indexOf(' ');
  if (firstSpace === -1) {
    return input.slice(1);
  }
  return null;
}

/**
 * Filter commands that match the given query (case-insensitive prefix match
 * on name or aliases).
 */
export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter((cmd) => {
    if (cmd.name.slice(1).startsWith(q)) return true;
    return cmd.aliases?.some((a) => a.slice(1).startsWith(q)) ?? false;
  });
}

/**
 * Resolve an input string to a registered slash command.
 * Returns `null` if no command matches.
 */
export function resolveSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const token = trimmed.split(/\s+/)[0]!.toLowerCase();
  return (
    SLASH_COMMANDS.find(
      (cmd) => cmd.name === token || (cmd.aliases?.includes(token) ?? false),
    ) ?? null
  );
}
