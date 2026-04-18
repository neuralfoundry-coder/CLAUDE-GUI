import type { ClaudeServerMessage } from '@/types/websocket';

export type MessageKind =
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'system'
  | 'error'
  | 'auto_decision';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  kind: MessageKind;
  content: string;
  timestamp: number;
  toolName?: string;
  toolInput?: unknown;
  isStreaming?: boolean;
}

export interface SessionStats {
  sessionId: string;
  model: string | null;
  numTurns: number | null;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  lastUpdated: number | null;
  lastContextTokens: number | null;
  contextWindow: number | null;
}

export interface ClaudeTab {
  id: string;
  name: string;
  createdAt: number;
  sessionId: string | null;
  customName: boolean;
}

export interface ClaudeTabState {
  messages: ChatMessage[];
  streamingChunks: string[];
  streamingMessageId: string | null;
  isStreaming: boolean;
  pendingPermission: Extract<ClaudeServerMessage, { type: 'permission_request' }> | null;
  currentRequestId: string | null;
  messageFilter: Set<MessageKind>;
}

// ── SDK message types ──

export interface SdkContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
}

export interface SdkAssistantMessage {
  type: 'assistant';
  message: { content: SdkContentBlock[]; usage?: { input_tokens?: number; output_tokens?: number } };
  session_id?: string;
}

export interface SdkUserMessage {
  type: 'user';
  message: { content: SdkContentBlock[] | string };
  session_id?: string;
}

export interface SdkSystemMessage {
  type: 'system';
  subtype?: string;
  session_id?: string;
  model?: string;
}

export interface SdkPartialAssistantMessage {
  type: 'stream_event';
  event: {
    type: string;
    index?: number;
    delta?: { type: string; text?: string; partial_json?: string };
    content_block?: { type: string; id?: string; name?: string; input?: unknown; text?: string };
  };
  session_id: string;
}

export interface SdkToolProgressMessage {
  type: 'tool_progress';
  tool_use_id: string;
  tool_name: string;
  elapsed_time_seconds: number;
  session_id: string;
}

export interface SdkModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  webSearchRequests?: number;
  costUSD?: number;
  contextWindow?: number;
}

export interface SdkResultMessage {
  type: 'result';
  subtype?: string;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  session_id?: string;
  num_turns?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
  modelUsage?: Record<string, SdkModelUsage>;
}

export interface StreamingToolInput {
  toolName: string;
  chunks: string[];
  lastFlushAt: number;
  filePath: string | null;
}
