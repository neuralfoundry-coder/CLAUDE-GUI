import path from 'node:path';

const DANGEROUS_TOOLS = new Set(['Bash', 'Edit', 'Write', 'MultiEdit']);
const DANGER_PATTERNS = [
  /\brm\s+-[rfR]+/,
  /\bsudo\b/,
  /\bcurl\s+[^|]*\|\s*(?:sh|bash)/,
  /\bwget\s+[^|]*\|\s*(?:sh|bash)/,
  /\/etc\//,
  /\/System\//,
];

function assessDanger(args) {
  if (args && typeof args === 'object') {
    const cmd = args.command || args.file_path || '';
    if (typeof cmd === 'string') {
      for (const p of DANGER_PATTERNS) {
        if (p.test(cmd)) return 'danger';
      }
    }
  }
  return 'safe';
}

async function loadAgentSdk() {
  try {
    const mod = await import('@anthropic-ai/claude-agent-sdk');
    return mod;
  } catch (err) {
    console.error('[claude-handler] failed to load Agent SDK', err);
    return null;
  }
}

export default async function claudeHandler(ws, _req) {
  const sdk = await loadAgentSdk();
  if (!sdk) {
    ws.send(JSON.stringify({ type: 'error', message: 'Claude Agent SDK not available' }));
    return;
  }

  const cwd = path.resolve(process.env.PROJECT_ROOT || process.cwd());
  const pendingPermissions = new Map();
  let currentAbort = null;

  const requestPermission = (requestId, tool, args) =>
    new Promise((resolve) => {
      pendingPermissions.set(requestId, resolve);
      ws.send(
        JSON.stringify({
          type: 'permission_request',
          requestId,
          tool,
          args,
          danger: assessDanger(args),
        }),
      );
    });

  const send = (msg) => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        /* ignore */
      }
    }
  };

  const runQuery = async (msg) => {
    const { requestId, prompt, sessionId, options = {} } = msg;
    const abort = new AbortController();
    currentAbort = abort;

    try {
      const stream = sdk.query({
        prompt,
        cwd,
        sessionId,
        signal: abort.signal,
        ...options,
      });

      for await (const event of stream) {
        if (abort.signal.aborted) break;

        if (event.type === 'tool_use' || event.type === 'tool_call') {
          const tool = event.tool || event.name;
          if (DANGEROUS_TOOLS.has(tool)) {
            const permRequestId = `${requestId}-perm-${Date.now()}`;
            const approved = await requestPermission(permRequestId, tool, event.args || event.input);
            if (!approved) {
              send({ type: 'error', requestId, message: 'Permission denied by user', code: 4403 });
              return;
            }
          }
          send({ type: 'tool_call', requestId, data: { tool, args: event.args || event.input } });
          continue;
        }

        if (event.type === 'result') {
          send({ type: 'result', requestId, data: event });
          continue;
        }

        send({ type: 'message', requestId, data: event });
      }
    } catch (err) {
      send({ type: 'error', requestId, message: String(err?.message || err), code: 5501 });
    } finally {
      currentAbort = null;
    }
  };

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send({ type: 'error', message: 'Invalid JSON', code: 4400 });
      return;
    }

    if (msg.type === 'query') {
      runQuery(msg);
    } else if (msg.type === 'permission_response') {
      const resolver = pendingPermissions.get(msg.requestId);
      if (resolver) {
        resolver(Boolean(msg.approved));
        pendingPermissions.delete(msg.requestId);
      }
    } else if (msg.type === 'abort') {
      currentAbort?.abort();
    }
  });

  ws.on('close', () => {
    currentAbort?.abort();
    pendingPermissions.clear();
  });

  ws.on('error', (err) => {
    console.error('[claude-handler] ws error', err);
  });
}
