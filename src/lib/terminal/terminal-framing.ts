/**
 * Wire framing for /ws/terminal.
 *
 * - PTY data travels as BINARY WebSocket frames (ArrayBuffer / Buffer).
 * - Control messages travel as TEXT frames with JSON payloads.
 *
 * The client detects frame type by `typeof event.data`: string → control,
 * ArrayBuffer → PTY data.
 */

export interface TerminalResizeControl {
  type: 'resize';
  cols: number;
  rows: number;
}

export interface TerminalInputControl {
  type: 'input';
  data: string;
}

export interface TerminalPauseControl {
  type: 'pause';
}

export interface TerminalResumeControl {
  type: 'resume';
}

/**
 * Explicit destroy request. Triggers PTY kill and removes the session from
 * the server-side registry (FR-414). Without this, closing the WebSocket
 * only DETACHES — the PTY stays alive for a 30-minute grace period so the
 * client can re-attach via `?sessionId=<id>`.
 */
export interface TerminalCloseControl {
  type: 'close';
}

export type TerminalClientControl =
  | TerminalResizeControl
  | TerminalInputControl
  | TerminalPauseControl
  | TerminalResumeControl
  | TerminalCloseControl;

export interface TerminalExitServerControl {
  type: 'exit';
  code: number | null;
}

export type TerminalErrorCode = 'BUFFER_OVERFLOW' | 'PTY_UNAVAILABLE';

export interface TerminalErrorServerControl {
  type: 'error';
  code: TerminalErrorCode;
  message: string;
}

/**
 * Sent by the server on attach. Tells the client its authoritative
 * server-side session ID and whether a scrollback replay will follow.
 * When `replay: true`, the client must call `term.clear()` before the next
 * binary frame, which will contain the contents of the session's ring
 * buffer snapshot at attach time.
 */
export interface TerminalSessionServerControl {
  type: 'session';
  id: string;
  replay: boolean;
}

/**
 * Sent by the server in response to client `pause`/`resume` frames,
 * confirming the actual PTY state. Prevents state mismatch where the
 * client thinks the server paused but the pause() call actually failed.
 */
export interface TerminalBackpressureAckServerControl {
  type: 'backpressure_ack';
  paused: boolean;
  bufferedBytes: number;
}

export type TerminalServerControl =
  | TerminalExitServerControl
  | TerminalErrorServerControl
  | TerminalSessionServerControl
  | TerminalBackpressureAckServerControl;

export function isServerControlFrame(value: unknown): value is TerminalServerControl {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return type === 'exit' || type === 'error' || type === 'session' || type === 'backpressure_ack';
}

export function parseServerControlFrame(text: string): TerminalServerControl | null {
  try {
    const parsed = JSON.parse(text);
    return isServerControlFrame(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
