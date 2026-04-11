'use client';

import { ReconnectingWebSocket } from './reconnecting-ws';
import { useClaudeStore } from '@/stores/use-claude-store';
import { useConnectionStore } from '@/stores/use-connection-store';
import type { ClaudeClientMessage, ClaudeServerMessage } from '@/types/websocket';

let singleton: ClaudeClient | null = null;

class ClaudeClient {
  private ws: ReconnectingWebSocket;

  constructor() {
    this.ws = new ReconnectingWebSocket({
      url: `${typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss' : 'ws'}://${typeof location !== 'undefined' ? location.host : 'localhost'}/ws/claude`,
      onOpen: () => useConnectionStore.getState().setStatus('claude', 'open'),
      onClose: () => useConnectionStore.getState().setStatus('claude', 'closed'),
      onMessage: (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ClaudeServerMessage;
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
    useClaudeStore.getState().pushUserMessage(prompt);
    useClaudeStore.getState().setStreaming(true);
    this.send({ type: 'query', requestId, prompt, sessionId });
    return requestId;
  }

  respondToPermission(requestId: string, approved: boolean): void {
    this.send({ type: 'permission_response', requestId, approved });
    useClaudeStore.getState().setPendingPermission(null);
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
