import type {
  ClaudeTabState,
  MessageKind,
  SdkContentBlock,
  SdkModelUsage,
  SessionStats,
} from './types';

export const ALL_MESSAGE_KINDS: MessageKind[] = [
  'text',
  'tool_use',
  'tool_result',
  'system',
  'error',
  'auto_decision',
];

export const FILE_EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

export const STREAMING_EDIT_FLUSH_INTERVAL = 500;

export function emptyStats(sessionId: string): SessionStats {
  return {
    sessionId,
    model: null,
    numTurns: null,
    durationMs: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0,
    lastUpdated: null,
    lastContextTokens: null,
    contextWindow: null,
  };
}

export function emptyTabState(): ClaudeTabState {
  return {
    messages: [],
    streamingChunks: [],
    streamingMessageId: null,
    isStreaming: false,
    pendingPermission: null,
    currentRequestId: null,
    messageFilter: new Set<MessageKind>(ALL_MESSAGE_KINDS),
  };
}

let msgCounter = 0;
export function nextId(prefix: string): string {
  msgCounter += 1;
  return `${prefix}-${Date.now()}-${msgCounter}`;
}

let tabCounter = 0;
export function nextTabId(): string {
  tabCounter += 1;
  return `claude-tab-${Date.now()}-${tabCounter}`;
}

export function extractContent(blocks: SdkContentBlock[] | string | undefined): {
  text: string;
  tools: Array<{ name: string; input: unknown }>;
} {
  if (!blocks) return { text: '', tools: [] };
  if (typeof blocks === 'string') return { text: blocks, tools: [] };
  let text = '';
  const tools: Array<{ name: string; input: unknown }> = [];
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') {
      text += (text ? '\n' : '') + block.text;
    } else if (block.type === 'tool_use') {
      tools.push({ name: block.name ?? 'unknown', input: block.input });
    }
  }
  return { text, tools };
}

export function pickModelUsage(
  modelUsage: Record<string, SdkModelUsage> | undefined,
  preferredModel: string | null,
): SdkModelUsage | null {
  if (!modelUsage) return null;
  if (preferredModel && modelUsage[preferredModel]) return modelUsage[preferredModel];
  let best: SdkModelUsage | null = null;
  let bestWindow = 0;
  for (const usage of Object.values(modelUsage)) {
    const window = usage.contextWindow ?? 0;
    if (window >= bestWindow) {
      best = usage;
      bestWindow = window;
    }
  }
  return best;
}

export function tryParsePartialJson(chunks: string[]): Record<string, unknown> | null {
  const raw = chunks.join('');
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch { /* not parseable yet */ }
  try {
    return JSON.parse(raw + '"}') as Record<string, unknown>;
  } catch { /* still not parseable */ }
  try {
    return JSON.parse(raw + '"}]}') as Record<string, unknown>;
  } catch { /* still not parseable */ }
  return null;
}

export function extractFilePath(parsed: Record<string, unknown>): string | null {
  if (typeof parsed.file_path === 'string' && parsed.file_path) return parsed.file_path;
  return null;
}
