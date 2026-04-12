'use client';

import { ReconnectingWebSocket } from './reconnecting-ws';
import { useClaudeStore } from '@/stores/use-claude-store';
import { useConnectionStore } from '@/stores/use-connection-store';
import { useEditorStore } from '@/stores/use-editor-store';
import { useSettingsStore } from '@/stores/use-settings-store';
import type { ActiveFileContext, ClaudeClientMessage, ClaudeServerMessage } from '@/types/websocket';

let singleton: ClaudeClient | null = null;

class ClaudeClient {
  private ws: ReconnectingWebSocket;
  private completionCallbacks = new Map<string, (completions: string[]) => void>();
  private boundBeforeUnload: (() => void) | null = null;

  constructor() {
    this.ws = new ReconnectingWebSocket({
      url: `${typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss' : 'ws'}://${typeof location !== 'undefined' ? location.host : 'localhost'}/ws/claude`,
      onOpen: () => useConnectionStore.getState().setStatus('claude', 'open'),
      onClose: () => {
        useConnectionStore.getState().setStatus('claude', 'closed');
        // Reset streaming state when connection drops so the UI
        // doesn't get stuck in a loading state after reconnection.
        const store = useClaudeStore.getState();
        if (store.isStreaming) {
          store.setStreaming(false);
        }
      },
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

    // On page refresh/close, send abort via WebSocket and use sendBeacon
    // as a fallback to ensure the server cancels running commands.
    if (typeof window !== 'undefined') {
      this.boundBeforeUnload = () => {
        // Best-effort: send abort over WebSocket before it closes
        try {
          this.ws.sendJson({ type: 'abort', requestId: 'page-unload' });
        } catch {
          /* ignore */
        }
        // Fallback: sendBeacon to HTTP abort endpoint (works even if WS is already closed)
        try {
          navigator.sendBeacon('/api/claude/abort');
        } catch {
          /* ignore */
        }
      };
      window.addEventListener('beforeunload', this.boundBeforeUnload);
    }
  }

  send(msg: ClaudeClientMessage): void {
    this.ws.sendJson(msg);
  }

  private getActiveFileContext(): ActiveFileContext | undefined {
    const { tabs, activeTabId, cursorLine, cursorCol } = useEditorStore.getState();
    if (!activeTabId) return undefined;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return undefined;
    return {
      path: tab.path,
      dirty: tab.dirty,
      hasDiff: tab.diff != null,
      cursorLine,
      cursorCol,
    };
  }

  sendQuery(
    prompt: string,
    intent?: { type: string; preferences?: Record<string, unknown> },
  ): string {
    const requestId = `q-${Date.now()}`;
    const activeId = useClaudeStore.getState().activeSessionId ?? undefined;
    // Fork pseudo-ids start with "fork-of-" and signal: begin a fresh SDK
    // session but remember the parent for UI reference. We do not pass
    // the parent id as `sessionId` so the SDK creates a new session.
    const sessionId = activeId && activeId.startsWith('fork-of-') ? undefined : activeId;
    const selectedModel = useSettingsStore.getState().selectedModel;
    const activeFile = this.getActiveFileContext();
    useClaudeStore.getState().pushUserMessage(prompt);
    useClaudeStore.getState().setStreaming(true);
    useClaudeStore.getState().setCurrentRequestId(requestId);
    this.send({
      type: 'query',
      requestId,
      prompt,
      sessionId,
      ...(activeFile ? { activeFile } : {}),
      ...(intent ? { intent } : {}),
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
    if (typeof window !== 'undefined' && this.boundBeforeUnload) {
      window.removeEventListener('beforeunload', this.boundBeforeUnload);
      this.boundBeforeUnload = null;
    }
    this.ws.close();
  }
}

export function getClaudeClient(): ClaudeClient {
  if (!singleton) singleton = new ClaudeClient();
  return singleton;
}
