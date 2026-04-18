import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useClaudeStore } from '@/stores/use-claude-store';
import { registerAborter, __resetAborterForTests } from '@/lib/claude/request-aborter';

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

  it('tracks last-turn context usage and window from result.modelUsage', () => {
    useClaudeStore.getState().handleServerMessage({
      type: 'message',
      requestId: 'r0',
      data: {
        type: 'system',
        subtype: 'init',
        session_id: 'sess-ctx',
        model: 'claude-opus-4-6',
      },
    } as never);
    useClaudeStore.getState().handleServerMessage({
      type: 'result',
      requestId: 'r1',
      data: {
        type: 'result',
        subtype: 'success',
        session_id: 'sess-ctx',
        total_cost_usd: 0.01,
        usage: { input_tokens: 100, output_tokens: 20 },
        modelUsage: {
          'claude-opus-4-6': {
            inputTokens: 40_000,
            outputTokens: 500,
            cacheReadInputTokens: 5_000,
            cacheCreationInputTokens: 1_000,
            webSearchRequests: 0,
            costUSD: 0.01,
            contextWindow: 200_000,
          },
        },
      },
    } as never);
    const afterFirst = useClaudeStore.getState().sessionStats['sess-ctx'];
    expect(afterFirst!.contextWindow).toBe(200_000);
    expect(afterFirst!.lastContextTokens).toBe(46_000);

    useClaudeStore.getState().handleServerMessage({
      type: 'result',
      requestId: 'r2',
      data: {
        type: 'result',
        subtype: 'success',
        session_id: 'sess-ctx',
        total_cost_usd: 0.02,
        usage: { input_tokens: 50, output_tokens: 10 },
        modelUsage: {
          'claude-opus-4-6': {
            inputTokens: 70_000,
            outputTokens: 800,
            cacheReadInputTokens: 8_000,
            cacheCreationInputTokens: 2_000,
            webSearchRequests: 0,
            costUSD: 0.02,
            contextWindow: 200_000,
          },
        },
      },
    } as never);
    const afterSecond = useClaudeStore.getState().sessionStats['sess-ctx'];
    expect(afterSecond!.lastContextTokens).toBe(80_000);
    expect(afterSecond!.contextWindow).toBe(200_000);
  });

  describe('dispatcher coverage', () => {
    it('permission_request stores the request under the active tab', () => {
      useClaudeStore.getState().reset();
      useClaudeStore.getState().handleServerMessage({
        type: 'permission_request',
        requestId: 'r1',
        tool: 'Bash',
        args: { command: 'ls' },
        danger: 'safe',
      });
      expect(useClaudeStore.getState().pendingPermission?.tool).toBe('Bash');
    });

    it('auto_decision appends a system message with the tool label', () => {
      useClaudeStore.getState().reset();
      useClaudeStore.getState().handleServerMessage({
        type: 'auto_decision',
        requestId: 'r1',
        tool: 'Edit',
        decision: 'allow',
        reason: 'policy matched',
      } as never);
      const msgs = useClaudeStore.getState().messages;
      const decision = msgs.find((m) => m.kind === 'auto_decision');
      expect(decision).toBeDefined();
      expect(decision!.content).toContain('Auto-allowed Edit');
      expect(decision!.toolName).toBe('Edit');
    });

    it('tool_call is a no-op (no crash, no state drift)', () => {
      useClaudeStore.getState().reset();
      const before = useClaudeStore.getState();
      expect(() =>
        useClaudeStore.getState().handleServerMessage({
          type: 'tool_call',
          requestId: 'r1',
        } as never),
      ).not.toThrow();
      expect(useClaudeStore.getState().messages).toEqual(before.messages);
    });

    it('error ends streaming and appends an error message', () => {
      useClaudeStore.getState().reset();
      useClaudeStore.setState((s) => ({
        tabStates: {
          ...s.tabStates,
          [s.activeTabId!]: {
            ...s.tabStates[s.activeTabId!]!,
            isStreaming: true,
            currentRequestId: 'r-err',
          },
        },
      }));
      useClaudeStore.getState().handleServerMessage({
        type: 'error',
        requestId: 'r-err',
        message: 'server went boom',
      } as never);
      const s = useClaudeStore.getState();
      expect(s.isStreaming).toBe(false);
      const errMsg = s.messages.find((m) => m.kind === 'error');
      expect(errMsg?.content).toContain('server went boom');
    });

    it('system init records the session model against the session stats bucket', () => {
      useClaudeStore.getState().reset();
      useClaudeStore.getState().handleServerMessage({
        type: 'message',
        requestId: 'r1',
        data: {
          type: 'system',
          subtype: 'init',
          session_id: 'sess-z',
          model: 'claude-opus-4-8',
        },
      } as never);
      const stats = useClaudeStore.getState().sessionStats['sess-z'];
      expect(stats?.model).toBe('claude-opus-4-8');
    });

    it('content_block_start for a tool_use appends a streaming tool message', () => {
      useClaudeStore.getState().reset();
      useClaudeStore.getState().handleServerMessage({
        type: 'message',
        requestId: 'r1',
        data: {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', name: 'Write', id: 'tu-1' },
          },
          session_id: 'sess-t',
        },
      } as never);
      const tool = useClaudeStore.getState().messages.find(
        (m) => m.kind === 'tool_use' && m.toolName === 'Write' && m.isStreaming,
      );
      expect(tool).toBeDefined();
      expect(tool!.content).toContain('Running Write');
    });

    it('tool_progress updates the elapsed time on the matching streaming tool message', () => {
      useClaudeStore.getState().reset();
      // Seed a streaming tool_use message via content_block_start.
      useClaudeStore.getState().handleServerMessage({
        type: 'message',
        requestId: 'r1',
        data: {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', name: 'Edit' },
          },
          session_id: 'sess-p',
        },
      } as never);
      useClaudeStore.getState().handleServerMessage({
        type: 'message',
        requestId: 'r1',
        data: {
          type: 'tool_progress',
          tool_use_id: 'tu-1',
          tool_name: 'Edit',
          elapsed_time_seconds: 4.7,
          session_id: 'sess-p',
        },
      } as never);
      const tool = useClaudeStore.getState().messages.find(
        (m) => m.kind === 'tool_use' && m.toolName === 'Edit',
      );
      expect(tool?.content).toContain('5s');
    });

    it('assistant message with inline tool_use captures both text and tool', () => {
      useClaudeStore.getState().reset();
      useClaudeStore.getState().handleServerMessage({
        type: 'message',
        requestId: 'r1',
        data: {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Calling editor' },
              { type: 'tool_use', name: 'Edit', input: { file_path: 'a.ts' } },
            ],
          },
          session_id: 'sess-a2',
        },
      } as never);
      const msgs = useClaudeStore.getState().messages;
      const textMsg = msgs.find((m) => m.kind === 'text' && m.role === 'assistant');
      const toolMsg = msgs.find((m) => m.kind === 'tool_use' && m.toolName === 'Edit');
      expect(textMsg?.content).toBe('Calling editor');
      expect(toolMsg).toBeDefined();
    });

    it('result with total_cost_usd=0 does not crash the reducer and still finalizes streaming', () => {
      useClaudeStore.getState().reset();
      useClaudeStore.setState((s) => ({
        tabStates: {
          ...s.tabStates,
          [s.activeTabId!]: {
            ...s.tabStates[s.activeTabId!]!,
            isStreaming: true,
          },
        },
      }));
      useClaudeStore.getState().handleServerMessage({
        type: 'result',
        requestId: 'r1',
        data: {
          type: 'result',
          subtype: 'success',
          total_cost_usd: 0,
          usage: { input_tokens: 0, output_tokens: 0 },
          session_id: 'sess-r',
        },
      } as never);
      expect(useClaudeStore.getState().isStreaming).toBe(false);
    });
  });

  describe('streaming text deltas', () => {
    it('builds content incrementally without re-joining the chunk array on every token', () => {
      useClaudeStore.getState().reset();
      const deltas = ['Hel', 'lo', ' ', 'wor', 'ld', '!'];
      for (const text of deltas) {
        useClaudeStore.getState().handleServerMessage({
          type: 'message',
          requestId: 'r-stream',
          data: {
            type: 'stream_event',
            event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
            session_id: 'sess-stream',
          },
        } as never);
      }
      const s = useClaudeStore.getState();
      // One streaming assistant message; content equals the concat of all deltas.
      const assistant = s.messages.filter((m) => m.role === 'assistant' && m.kind === 'text');
      expect(assistant).toHaveLength(1);
      expect(assistant[0]!.content).toBe('Hello world!');
      expect(assistant[0]!.isStreaming).toBe(true);
    });
  });

  describe('closeTab during streaming', () => {
    afterEach(() => {
      __resetAborterForTests();
    });

    it('synchronously aborts the in-flight request before the reducer drops the tab', () => {
      const abort = vi.fn();
      registerAborter(abort);
      // Create a second tab so closeTab takes the non-last-tab path.
      const tabA = useClaudeStore.getState().createTab();
      useClaudeStore.getState().createTab();
      useClaudeStore.setState((s) => ({
        tabStates: {
          ...s.tabStates,
          [tabA]: {
            ...s.tabStates[tabA]!,
            isStreaming: true,
            currentRequestId: 'req-inflight',
          },
        },
      }));

      // Capture: abort must be invoked *while* the tab state is still present.
      let tabStatePresentAtAbort = false;
      abort.mockImplementation((id: string) => {
        tabStatePresentAtAbort =
          !!useClaudeStore.getState().tabStates[tabA] && id === 'req-inflight';
      });

      useClaudeStore.getState().closeTab(tabA);

      expect(abort).toHaveBeenCalledTimes(1);
      expect(abort).toHaveBeenCalledWith('req-inflight');
      expect(tabStatePresentAtAbort).toBe(true);
      // After closeTab, the tab is gone and a late server response must not
      // resurrect it or crash routing.
      expect(useClaudeStore.getState().tabStates[tabA]).toBeUndefined();
      expect(() =>
        useClaudeStore.getState().handleServerMessage({
          type: 'result',
          requestId: 'req-inflight',
          data: {
            type: 'result',
            subtype: 'success',
            total_cost_usd: 0,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        } as never),
      ).not.toThrow();
    });

    it('does not call abort when tab is not streaming', () => {
      const abort = vi.fn();
      registerAborter(abort);
      const tabId = useClaudeStore.getState().createTab();
      useClaudeStore.getState().closeTab(tabId);
      expect(abort).not.toHaveBeenCalled();
    });
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
