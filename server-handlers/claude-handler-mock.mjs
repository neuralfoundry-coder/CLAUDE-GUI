/**
 * Deterministic Claude WebSocket mock for E2E tests.
 *
 * Activated via `CLAUDE_MOCK_HANDLER=1` on the server. Behaves like the real
 * `claude-handler.mjs` on the wire — accepts the same client message shapes
 * and emits the same server message shapes — but the responses are canned
 * and instantaneous, so tests can exercise the full Zustand dispatcher and
 * UI plumbing without any real Claude CLI / auth / model in the loop.
 *
 * Supported client messages:
 *   - { type: 'query', requestId, prompt }
 *   - { type: 'abort', requestId }
 *   - { type: 'permission_response', requestId, approve }
 *
 * Emitted server messages per `/query`:
 *   1. { type: 'message', requestId, data: { type: 'system', subtype: 'init', session_id, model } }
 *   2. A few `stream_event` text_delta frames that spell out a mock reply.
 *   3. For prompts containing the literal token `[NEED_PERMISSION]`:
 *        a permission_request that the client must approve before (4) runs.
 *   4. { type: 'result', requestId, data: { ... total_cost_usd, usage, session_id } }
 */

import { Buffer } from 'node:buffer';

function send(ws, obj) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

function nextSessionId() {
  return 'mock-sess-' + Math.random().toString(36).slice(2, 10);
}

export default async function claudeHandlerMock(ws /* , req */) {
  // Track per-connection in-flight requests so abort can cancel them cleanly.
  const inFlight = new Map(); // requestId → { timeouts: NodeJS.Timeout[], aborted: boolean }
  // Track pending permission requests so permission_response can unblock them.
  const pendingPermission = new Map(); // requestId → resolve fn

  const runQuery = async (requestId, prompt) => {
    const entry = { timeouts: [], aborted: false };
    inFlight.set(requestId, entry);
    const schedule = (delayMs, fn) => {
      const t = setTimeout(() => {
        if (entry.aborted) return;
        fn();
      }, delayMs);
      entry.timeouts.push(t);
    };

    const sessionId = nextSessionId();

    // (1) system init
    schedule(10, () => {
      send(ws, {
        type: 'message',
        requestId,
        data: { type: 'system', subtype: 'init', session_id: sessionId, model: 'mock-claude-opus' },
      });
    });

    // (2) a couple of streamed text deltas
    const chunks = ['Hello, ', 'this is ', 'a mock ', 'reply.'];
    chunks.forEach((chunk, idx) => {
      schedule(20 + idx * 10, () => {
        send(ws, {
          type: 'message',
          requestId,
          data: {
            type: 'stream_event',
            event: { type: 'content_block_delta', delta: { type: 'text_delta', text: chunk } },
            session_id: sessionId,
          },
        });
      });
    });

    // (3) optional permission gate
    if (typeof prompt === 'string' && prompt.includes('[NEED_PERMISSION]')) {
      schedule(70, () => {
        send(ws, {
          type: 'permission_request',
          requestId,
          tool: 'Write',
          args: { file_path: 'mock.ts', content: 'mock' },
          danger: 'safe',
        });
      });
      // Wait for permission_response before sending the result.
      await new Promise((resolve) => {
        pendingPermission.set(requestId, resolve);
      });
      if (entry.aborted) return;
    }

    // (4) result
    schedule(prompt?.includes('[NEED_PERMISSION]') ? 10 : 80, () => {
      send(ws, {
        type: 'result',
        requestId,
        data: {
          type: 'result',
          subtype: 'success',
          total_cost_usd: 0.01,
          duration_ms: 100,
          num_turns: 1,
          session_id: sessionId,
          usage: { input_tokens: 10, output_tokens: 8 },
          result: 'Hello, this is a mock reply.',
        },
      });
      inFlight.delete(requestId);
    });
  };

  ws.on('message', (raw) => {
    let msg;
    try {
      const str = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
      msg = JSON.parse(str);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'query' && typeof msg.requestId === 'string') {
      void runQuery(msg.requestId, msg.prompt ?? '');
      return;
    }
    if (msg.type === 'abort' && typeof msg.requestId === 'string') {
      const entry = inFlight.get(msg.requestId);
      if (entry) {
        entry.aborted = true;
        for (const t of entry.timeouts) clearTimeout(t);
        inFlight.delete(msg.requestId);
      }
      const pending = pendingPermission.get(msg.requestId);
      if (pending) {
        pendingPermission.delete(msg.requestId);
        pending();
      }
      return;
    }
    if (msg.type === 'permission_response' && typeof msg.requestId === 'string') {
      const resolve = pendingPermission.get(msg.requestId);
      if (resolve) {
        pendingPermission.delete(msg.requestId);
        resolve();
      }
      return;
    }
  });

  ws.on('close', () => {
    for (const entry of inFlight.values()) {
      entry.aborted = true;
      for (const t of entry.timeouts) clearTimeout(t);
    }
    inFlight.clear();
    for (const resolve of pendingPermission.values()) {
      try { resolve(); } catch { /* ignore */ }
    }
    pendingPermission.clear();
  });
}
