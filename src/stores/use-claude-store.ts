'use client';

import { create } from 'zustand';
import type {
  ClaudePermissionRequest,
  ClaudeServerMessage,
  ClaudeStreamMessage,
  ClaudeToolCallMessage,
  ClaudeResultMessage,
} from '@/types/websocket';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
}

interface ClaudeState {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeSessionId: string | null;
  pendingPermission: ClaudePermissionRequest | null;
  totalCost: number;
  tokenUsage: { input: number; output: number };
  currentRequestId: string | null;

  pushUserMessage: (content: string) => string;
  handleServerMessage: (msg: ClaudeServerMessage) => void;
  setPendingPermission: (req: ClaudePermissionRequest | null) => void;
  reset: () => void;
  setActiveSessionId: (id: string | null) => void;
  setStreaming: (streaming: boolean) => void;
}

export const useClaudeStore = create<ClaudeState>((set) => ({
  messages: [],
  isStreaming: false,
  activeSessionId: null,
  pendingPermission: null,
  totalCost: 0,
  tokenUsage: { input: 0, output: 0 },
  currentRequestId: null,

  pushUserMessage: (content) => {
    const id = `u-${Date.now()}`;
    set((s) => ({
      messages: [...s.messages, { id, role: 'user', content, timestamp: Date.now() }],
    }));
    return id;
  },

  handleServerMessage: (msg) => {
    switch (msg.type) {
      case 'message': {
        const m = msg as ClaudeStreamMessage;
        const data = m.data as { type?: string; content?: string; delta?: string };
        if (data?.type === 'assistant' && typeof data.content === 'string') {
          set((s) => ({
            messages: [
              ...s.messages,
              {
                id: `a-${Date.now()}-${Math.random()}`,
                role: 'assistant',
                content: data.content!,
                timestamp: Date.now(),
              },
            ],
          }));
        } else if (data?.type === 'stream_event' && typeof data.delta === 'string') {
          set((s) => {
            const last = s.messages[s.messages.length - 1];
            if (last?.role === 'assistant') {
              return {
                messages: [
                  ...s.messages.slice(0, -1),
                  { ...last, content: last.content + data.delta },
                ],
              };
            }
            return {
              messages: [
                ...s.messages,
                {
                  id: `a-${Date.now()}-${Math.random()}`,
                  role: 'assistant',
                  content: data.delta!,
                  timestamp: Date.now(),
                },
              ],
            };
          });
        }
        break;
      }

      case 'tool_call': {
        const m = msg as ClaudeToolCallMessage;
        set((s) => ({
          messages: [
            ...s.messages,
            {
              id: `t-${Date.now()}-${Math.random()}`,
              role: 'tool',
              content: JSON.stringify(m.data.args).slice(0, 200),
              timestamp: Date.now(),
              toolName: m.data.tool,
            },
          ],
        }));
        break;
      }

      case 'permission_request': {
        set({ pendingPermission: msg });
        break;
      }

      case 'result': {
        const m = msg as ClaudeResultMessage;
        set((s) => ({
          isStreaming: false,
          activeSessionId: m.data.session_id ?? s.activeSessionId,
          totalCost: s.totalCost + (m.data.cost_usd || 0),
          tokenUsage: {
            input: s.tokenUsage.input + (m.data.usage?.input_tokens || 0),
            output: s.tokenUsage.output + (m.data.usage?.output_tokens || 0),
          },
          currentRequestId: null,
        }));
        break;
      }

      case 'error': {
        set((s) => ({
          isStreaming: false,
          messages: [
            ...s.messages,
            {
              id: `e-${Date.now()}`,
              role: 'assistant',
              content: `Error: ${msg.message}`,
              timestamp: Date.now(),
            },
          ],
        }));
        break;
      }
    }
  },

  setPendingPermission: (req) => set({ pendingPermission: req }),
  reset: () =>
    set({
      messages: [],
      isStreaming: false,
      activeSessionId: null,
      pendingPermission: null,
      totalCost: 0,
      tokenUsage: { input: 0, output: 0 },
      currentRequestId: null,
    }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
}));
