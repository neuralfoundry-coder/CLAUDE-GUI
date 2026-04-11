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

export type TerminalClientControl =
  | TerminalResizeControl
  | TerminalInputControl
  | TerminalPauseControl
  | TerminalResumeControl;

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

export type TerminalServerControl = TerminalExitServerControl | TerminalErrorServerControl;

export function isServerControlFrame(value: unknown): value is TerminalServerControl {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return type === 'exit' || type === 'error';
}

export function parseServerControlFrame(text: string): TerminalServerControl | null {
  try {
    const parsed = JSON.parse(text);
    return isServerControlFrame(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
