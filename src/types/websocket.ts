export type WsEndpoint = '/ws/terminal' | '/ws/claude' | '/ws/files';

export interface WsHealthCheck {
  type: 'health';
  ok: boolean;
  timestamp: number;
}

export interface FileChangeMessage {
  type: 'change';
  event: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'ready';
  path: string;
  timestamp: string;
}

export type FileWsClientMessage = { type: 'watch'; path: string } | { type: 'unwatch' };
export type FileWsServerMessage = FileChangeMessage | { type: 'error'; message: string };

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

export interface ClaudeQueryMessage {
  type: 'query';
  requestId: string;
  prompt: string;
  sessionId?: string;
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

export type ClaudeClientMessage =
  | ClaudeQueryMessage
  | ClaudePermissionResponse
  | ClaudeAbortMessage;

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

export interface ClaudeResultMessage {
  type: 'result';
  requestId: string;
  data: {
    cost_usd: number;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens?: number;
    };
    session_id: string;
    duration_ms: number;
  };
}

export interface ClaudeErrorMessage {
  type: 'error';
  requestId?: string;
  message: string;
  code?: number;
}

export type ClaudeServerMessage =
  | ClaudeStreamMessage
  | ClaudeToolCallMessage
  | ClaudePermissionRequest
  | ClaudeResultMessage
  | ClaudeErrorMessage;
