'use client';

import { ReconnectingWebSocket } from './reconnecting-ws';
import { useClaudeStore } from '@/stores/use-claude-store';
import { useConnectionStore } from '@/stores/use-connection-store';
import { useSettingsStore } from '@/stores/use-settings-store';
import type { ClaudeClientMessage, ClaudeServerMessage } from '@/types/websocket';

let singleton: ClaudeClient | null = null;

class ClaudeClient {
  private ws: ReconnectingWebSocket;
  private completionCallbacks = new Map<string, (completions: string[]) => void>();

  constructor() {
    this.ws = new ReconnectingWebSocket({
      url: `${typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss' : 'ws'}://${typeof location !== 'undefined' ? location.host : 'localhost'}/ws/claude`,
      onOpen: () => useConnectionStore.getState().setStatus('claude', 'open'),
      onClose: () => useConnectionStore.getState().setStatus('claude', 'closed'),
      onMessage: (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ClaudeServerMessage;
          // Route completion responses to their callbacks
          if (msg.type === 'completion_response') {
            const cb = this.completionCallbacks.get(msg.requestId);
            if (cb) {
              this.completionCallbacks.delete(msg.requestId);
              cb(msg.completions);
            }
            return;
          }
          useClaudeStore.getState().handleServerMessage(msg);
        } catch {
          /* ignore */
        }
      },
    });
  }

  send(msg: ClaudeClientMessage): void {
    this.ws.sendJson(msg);
  }

  sendQuery(prompt: string): string {
    const requestId = `q-${Date.now()}`;
    const activeId = useClaudeStore.getState().activeSessionId ?? undefined;
    // Fork pseudo-ids start with "fork-of-" and signal: begin a fresh SDK
    // session but remember the parent for UI reference. We do not pass
    // the parent id as `sessionId` so the SDK creates a new session.
    const sessionId = activeId && activeId.startsWith('fork-of-') ? undefined : activeId;
    const selectedModel = useSettingsStore.getState().selectedModel;
    useClaudeStore.getState().pushUserMessage(prompt);
    useClaudeStore.getState().setStreaming(true);
    this.send({
      type: 'query',
      requestId,
      prompt,
      sessionId,
      ...(selectedModel ? { options: { model: selectedModel } } : {}),
    });
    return requestId;
  }

  respondToPermission(requestId: string, approved: boolean): void {
    this.send({ type: 'permission_response', requestId, approved });
    useClaudeStore.getState().setPendingPermission(null);
  }

  sendCompletionRequest(
    requestId: string,
    filePath: string,
    language: string,
    prefix: string,
    suffix: string,
  ): void {
    this.send({ type: 'completion_request', requestId, filePath, language, prefix, suffix });
  }

  /** Register a one-time handler for a specific completion response. */
  onCompletionResponse(requestId: string, callback: (completions: string[]) => void): void {
    this.completionCallbacks.set(requestId, callback);
  }

  abort(requestId: string): void {
    this.send({ type: 'abort', requestId });
  }

  close(): void {
    this.ws.close();
  }
}

export function getClaudeClient(): ClaudeClient {
  if (!singleton) singleton = new ClaudeClient();
  return singleton;
}
