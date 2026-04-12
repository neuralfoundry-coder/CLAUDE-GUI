import { getActiveRoot } from '../src/lib/project/project-context.mjs';
import { createDebug } from '../src/lib/debug.mjs';
import {
  loadSettings,
  normalizeRules,
  isToolAllowedBySettings,
  isToolDeniedBySettings,
} from '../src/lib/claude/settings-manager.mjs';
import { intentRegistry } from './prompt-templates/registry.mjs';

const dbg = createDebug('claude');

const DANGER_PATTERNS = [
  /\brm\s+-[rfR]+/,
  /\bsudo\b/,
  /\bcurl\s+[^|]*\|\s*(?:sh|bash)/,
  /\bwget\s+[^|]*\|\s*(?:sh|bash)/,
  /\/etc\//,
  /\/System\//,
];

function assessDanger(toolName, input) {
  if (!input || typeof input !== 'object') return 'safe';
  const strings = [];
  if (typeof input.command === 'string') strings.push(input.command);
  if (typeof input.file_path === 'string') strings.push(input.file_path);
  if (toolName === 'Bash' && strings.length === 0) return 'warning';
  for (const s of strings) {
    for (const p of DANGER_PATTERNS) {
      if (p.test(s)) return 'danger';
    }
  }
  return 'safe';
}

async function loadAgentSdk() {
  try {
    const mod = await import('@anthropic-ai/claude-agent-sdk');
    return mod;
  } catch (err) {
    dbg.error('failed to load Agent SDK', err);
    return null;
  }
}

export default async function claudeHandler(ws, _req) {
  const sdk = await loadAgentSdk();
  if (!sdk) {
    ws.send(JSON.stringify({ type: 'error', message: 'Claude Agent SDK not available' }));
    return;
  }

  const pendingPermissions = new Map();
  let currentAbort = null;
  let permissionCounter = 0;

  const send = (msg) => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        /* ignore */
      }
    }
  };

  const requestPermission = (toolName, input) =>
    new Promise((resolve) => {
      permissionCounter += 1;
      const requestId = `perm-${Date.now()}-${permissionCounter}`;
      pendingPermissions.set(requestId, resolve);
      send({
        type: 'permission_request',
        requestId,
        tool: toolName,
        args: input,
        danger: assessDanger(toolName, input),
      });
    });

  const canUseTool = async (toolName, input, { signal }) => {
    dbg.info('canUseTool', toolName);
    if (signal.aborted) {
      return { behavior: 'deny', message: 'Aborted by user', interrupt: true };
    }

    // Reload persisted allow/deny rules on every call so that "Always Allow"
    // additions take effect for the very next tool use without reconnecting.
    let rules = null;
    try {
      const settings = await loadSettings();
      rules = normalizeRules(settings);
    } catch (err) {
      dbg.warn('failed to load settings for permission check', err);
    }

    if (rules && isToolDeniedBySettings(toolName, rules)) {
      dbg.info('permission', toolName, 'deny (rule)');
      send({
        type: 'auto_decision',
        tool: toolName,
        decision: 'deny',
        source: 'settings',
      });
      return { behavior: 'deny', message: 'Denied by ClaudeGUI deny rule' };
    }

    if (rules && isToolAllowedBySettings(toolName, input, rules)) {
      dbg.info('permission', toolName, 'allow (rule)');
      send({
        type: 'auto_decision',
        tool: toolName,
        decision: 'allow',
        source: 'settings',
      });
      return { behavior: 'allow', updatedInput: input };
    }

    const approved = await requestPermission(toolName, input);
    dbg.info('permission', toolName, approved ? 'allow' : 'deny');
    if (approved) {
      return { behavior: 'allow', updatedInput: input };
    }
    return { behavior: 'deny', message: 'Denied by user via ClaudeGUI' };
  };

  const runCompletion = async (msg) => {
    const { requestId, filePath, language, prefix, suffix } = msg;
    const cwd = getActiveRoot();
    if (!cwd) {
      send({ type: 'error', requestId, code: 4412, message: 'No project is open.' });
      return;
    }
    dbg.info('completion start', { requestId, filePath, language });

    const abort = new AbortController();
    // Allow aborting completions via the shared currentAbort reference
    const prevAbort = currentAbort;
    currentAbort = abort;

    try {
      const completionPrompt = [
        `You are a code completion engine. Return ONLY the code that should be inserted at the cursor position. No markdown, no backticks, no explanation, no comments about what you're doing.`,
        ``,
        `File: ${filePath} (language: ${language})`,
        ``,
        `--- Code before cursor ---`,
        prefix,
        `--- Cursor is here ---`,
        suffix,
        `--- End of visible code ---`,
        ``,
        `Complete the code at the cursor position. Output ONLY the raw completion text.`,
      ].join('\n');

      const queryOptions = {
        cwd,
        abortController: abort,
        permissionMode: 'default',
        maxTurns: 1,
        canUseTool: () => ({ behavior: 'deny', message: 'Completion mode: no tools' }),
      };

      const stream = sdk.query({ prompt: completionPrompt, options: queryOptions });
      let resultText = '';

      for await (const event of stream) {
        if (abort.signal.aborted) break;
        if (event.type === 'result' && event.result) {
          resultText = event.result;
        }
      }

      // Strip markdown code fences if the model wraps the output
      resultText = resultText
        .replace(/^```[\w]*\n?/, '')
        .replace(/\n?```\s*$/, '')
        .trim();

      send({ type: 'completion_response', requestId, completions: resultText ? [resultText] : [] });
    } catch (err) {
      if (err?.name !== 'AbortError') {
        dbg.error('completion failed', err);
        send({ type: 'error', requestId, message: String(err?.message || err), code: 5502 });
      }
    } finally {
      if (currentAbort === abort) currentAbort = prevAbort;
    }
  };

  const runQuery = async (msg) => {
    const { requestId, prompt, sessionId, intent, options = {} } = msg;
    const abort = new AbortController();
    currentAbort = abort;

    const cwd = getActiveRoot();
    if (!cwd) {
      dbg.warn('query rejected: no active project root', { requestId });
      send({
        type: 'error',
        requestId,
        code: 4412,
        message: 'No project is open. Open a folder in the file explorer before running Claude queries.',
      });
      currentAbort = null;
      return;
    }
    dbg.info('query start', { requestId, sessionId: sessionId ?? '(new)', cwd });

    // Resolve augmented prompt via intent registry if applicable
    let finalPrompt = prompt;
    if (intent?.type && intentRegistry[intent.type]) {
      try {
        const mod = await intentRegistry[intent.type]();
        finalPrompt = mod.buildSlidePrompt(prompt, intent.preferences);
        dbg.info('intent prompt injected', { type: intent.type });
      } catch (err) {
        dbg.warn('intent prompt injection failed, using raw prompt', err);
      }
    }

    try {
      const queryOptions = {
        cwd,
        canUseTool,
        abortController: abort,
        permissionMode: 'default',
        ...(sessionId ? { resume: sessionId } : {}),
        ...(options.maxTurns ? { maxTurns: options.maxTurns } : {}),
        ...(options.model ? { model: options.model } : {}),
      };

      const stream = sdk.query({ prompt: finalPrompt, options: queryOptions });

      for await (const event of stream) {
        if (abort.signal.aborted) break;

        dbg.trace('event', event.type);
        if (event.type === 'result') {
          dbg.info('query result', {
            requestId,
            subtype: event.subtype,
            costUsd: event.total_cost_usd,
            durationMs: event.duration_ms,
          });
          send({ type: 'result', requestId, data: event });
          continue;
        }

        send({ type: 'message', requestId, data: event });
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        dbg.warn('query aborted', requestId);
        send({ type: 'error', requestId, message: 'Aborted', code: 4499 });
      } else {
        dbg.error('query failed', err);
        send({ type: 'error', requestId, message: String(err?.message || err), code: 5501 });
      }
    } finally {
      currentAbort = null;
      for (const resolve of pendingPermissions.values()) {
        try {
          resolve(false);
        } catch {
          /* ignore */
        }
      }
      pendingPermissions.clear();
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
    } else if (msg.type === 'completion_request') {
      runCompletion(msg);
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
    dbg.log('ws closed');
    currentAbort?.abort();
    pendingPermissions.clear();
  });

  ws.on('error', (err) => {
    dbg.error('ws error', err);
  });
}
