import { describe, it, expect, beforeEach } from 'vitest';
import { useClaudeStore } from '@/stores/use-claude-store';

describe('useClaudeStore', () => {
  beforeEach(() => {
    useClaudeStore.getState().reset();
  });

  it('pushes a user message', () => {
    useClaudeStore.getState().pushUserMessage('Hello');
    const s = useClaudeStore.getState();
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.role).toBe('user');
    expect(s.messages[0]!.content).toBe('Hello');
  });

  it('handles assistant message with text content blocks', () => {
    useClaudeStore.getState().handleServerMessage({
      type: 'message',
      requestId: 'r1',
      data: {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hi there' }] },
        session_id: 's-1',
      },
    } as never);
    const s = useClaudeStore.getState();
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.role).toBe('assistant');
    expect(s.messages[0]!.content).toBe('Hi there');
    expect(s.activeSessionId).toBe('s-1');
  });

  it('captures tool_use blocks as tool messages', () => {
    useClaudeStore.getState().handleServerMessage({
      type: 'message',
      requestId: 'r1',
      data: {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Calling Edit' },
            { type: 'tool_use', name: 'Edit', input: { file_path: 'src/a.ts' } },
          ],
        },
      },
    } as never);
    const s = useClaudeStore.getState();
    expect(s.messages).toHaveLength(2);
    expect(s.messages[1]!.role).toBe('tool');
    expect(s.messages[1]!.toolName).toBe('Edit');
  });

  it('captures session id from system init message', () => {
    useClaudeStore.getState().handleServerMessage({
      type: 'message',
      requestId: 'r1',
      data: { type: 'system', subtype: 'init', session_id: 'abc-123' },
    } as never);
    expect(useClaudeStore.getState().activeSessionId).toBe('abc-123');
  });

  it('stores permission requests', () => {
    useClaudeStore.getState().handleServerMessage({
      type: 'permission_request',
      requestId: 'r1',
      tool: 'Bash',
      args: { command: 'ls' },
      danger: 'safe',
    });
    expect(useClaudeStore.getState().pendingPermission?.tool).toBe('Bash');
  });

  it('accumulates cost and tokens from result', () => {
    useClaudeStore.getState().handleServerMessage({
      type: 'result',
      requestId: 'r1',
      data: {
        type: 'result',
        subtype: 'success',
        total_cost_usd: 0.05,
        usage: { input_tokens: 100, output_tokens: 50 },
        session_id: 'abc',
        duration_ms: 1000,
        num_turns: 1,
        result: 'done',
      },
    });
    const s = useClaudeStore.getState();
    expect(s.totalCost).toBeCloseTo(0.05);
    expect(s.tokenUsage.input).toBe(100);
    expect(s.tokenUsage.output).toBe(50);
    expect(s.activeSessionId).toBe('abc');
    expect(s.isStreaming).toBe(false);
  });

  it('resets all state', () => {
    useClaudeStore.getState().pushUserMessage('hi');
    useClaudeStore.getState().reset();
    const s = useClaudeStore.getState();
    expect(s.messages).toHaveLength(0);
    expect(s.totalCost).toBe(0);
    expect(s.sessionStats).toEqual({});
  });

  it('records per-session model from system init', () => {
    useClaudeStore.getState().handleServerMessage({
      type: 'message',
      requestId: 'r1',
      data: {
        type: 'system',
        subtype: 'init',
        session_id: 'sess-a',
        model: 'claude-opus-4-6',
      },
    } as never);
    const stats = useClaudeStore.getState().sessionStats['sess-a'];
    expect(stats).toBeDefined();
    expect(stats!.model).toBe('claude-opus-4-6');
    expect(stats!.sessionId).toBe('sess-a');
    expect(stats!.numTurns).toBeNull();
  });

  it('accumulates per-session stats across multiple result events', () => {
    const first = {
      type: 'result' as const,
      requestId: 'r1',
      data: {
        type: 'result' as const,
        subtype: 'success',
        total_cost_usd: 0.01,
        duration_ms: 500,
        num_turns: 1,
        session_id: 'sess-a',
        usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5 },
        result: 'ok',
      },
    };
    const second = {
      ...first,
      data: {
        ...first.data,
        total_cost_usd: 0.02,
        duration_ms: 1200,
        num_turns: 3,
        usage: { input_tokens: 150, output_tokens: 40, cache_read_input_tokens: 10 },
      },
    };
    useClaudeStore.getState().handleServerMessage(first);
    useClaudeStore.getState().handleServerMessage(second);
    const stats = useClaudeStore.getState().sessionStats['sess-a'];
    expect(stats).toBeDefined();
    expect(stats!.inputTokens).toBe(250);
    expect(stats!.outputTokens).toBe(60);
    expect(stats!.cacheReadTokens).toBe(15);
    expect(stats!.costUsd).toBeCloseTo(0.03);
    expect(stats!.numTurns).toBe(3);
    expect(stats!.durationMs).toBe(1200);
    expect(stats!.lastUpdated).not.toBeNull();
  });

  it('keeps stats isolated per session id', () => {
    useClaudeStore.getState().handleServerMessage({
      type: 'result',
      requestId: 'r1',
      data: {
        type: 'result',
        subtype: 'success',
        total_cost_usd: 0.01,
        session_id: 'sess-a',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    } as never);
    useClaudeStore.getState().handleServerMessage({
      type: 'result',
      requestId: 'r2',
      data: {
        type: 'result',
        subtype: 'success',
        total_cost_usd: 0.02,
        session_id: 'sess-b',
        usage: { input_tokens: 30, output_tokens: 10 },
      },
    } as never);
    const all = useClaudeStore.getState().sessionStats;
    expect(all['sess-a']!.inputTokens).toBe(10);
    expect(all['sess-b']!.inputTokens).toBe(30);
    expect(all['sess-a']!.costUsd).toBeCloseTo(0.01);
    expect(all['sess-b']!.costUsd).toBeCloseTo(0.02);
  });
});
