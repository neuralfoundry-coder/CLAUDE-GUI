export type WsEndpoint = '/ws/terminal' | '/ws/claude' | '/ws/files';

export interface WsHealthCheck {
  type: 'health';
  ok: boolean;
  timestamp: number;
}

export interface FileChangeMessage {
  type: 'change';
  event: 'add' | 'change' | 'unlink' | 'ready' | 'error';
  path: string;
  timestamp: string;
  message?: string;
}

export interface ProjectChangedMessage {
  type: 'project-changed';
  root: string;
  timestamp: string;
}

export type FileWsClientMessage = { type: 'watch'; path: string } | { type: 'unwatch' };
export type FileWsServerMessage =
  | FileChangeMessage
  | ProjectChangedMessage
  | { type: 'error'; message: string };

export interface TerminalResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

export type TerminalControlMessage =
  | TerminalResizeMessage
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'exit'; code: number };

export interface ActiveFileContext {
  path: string;
  dirty: boolean;
  hasDiff: boolean;
  cursorLine?: number | null;
  cursorCol?: number | null;
}

export interface ClaudeQueryMessage {
  type: 'query';
  requestId: string;
  prompt: string;
  sessionId?: string;
  activeFile?: ActiveFileContext;
  intent?: {
    type: string;
    preferences?: Record<string, unknown>;
  };
  options?: {
    maxTurns?: number;
    maxBudget?: number;
    model?: string;
  };
}

export interface ClaudePermissionResponse {
  type: 'permission_response';
  requestId: string;
  approved: boolean;
}

export interface ClaudeAbortMessage {
  type: 'abort';
  requestId: string;
}

export interface ClaudeCompletionRequest {
  type: 'completion_request';
  requestId: string;
  filePath: string;
  language: string;
  prefix: string;
  suffix: string;
}

export type ClaudeClientMessage =
  | ClaudeQueryMessage
  | ClaudePermissionResponse
  | ClaudeAbortMessage
  | ClaudeCompletionRequest;

export interface ClaudeStreamMessage {
  type: 'message';
  requestId: string;
  data: unknown;
}

export interface ClaudeToolCallMessage {
  type: 'tool_call';
  requestId: string;
  data: { tool: string; args: unknown };
}

export interface ClaudePermissionRequest {
  type: 'permission_request';
  requestId: string;
  tool: string;
  args: unknown;
  reason?: string;
  danger: 'safe' | 'warning' | 'danger';
}

export interface ClaudeModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  webSearchRequests?: number;
  costUSD?: number;
  contextWindow?: number;
}

export interface ClaudeResultMessage {
  type: 'result';
  requestId: string;
  data: {
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
    modelUsage?: Record<string, ClaudeModelUsage>;
  };
}

export interface ClaudeErrorMessage {
  type: 'error';
  requestId?: string;
  message: string;
  code?: number;
}

export interface ClaudeAutoDecisionMessage {
  type: 'auto_decision';
  tool: string;
  decision: 'allow' | 'deny';
  source: 'settings';
}

export interface ClaudeCompletionResponse {
  type: 'completion_response';
  requestId: string;
  completions: string[];
}

export type ClaudeServerMessage =
  | ClaudeStreamMessage
  | ClaudeToolCallMessage
  | ClaudePermissionRequest
  | ClaudeResultMessage
  | ClaudeErrorMessage
  | ClaudeAutoDecisionMessage
  | ClaudeCompletionResponse;
