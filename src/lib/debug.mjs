/* eslint-disable no-console */
// Lightweight module-based debug logger.
//
// Activation: set CLAUDEGUI_DEBUG to a comma-separated list of module names,
// or '*' / 'all' to enable every module. Each module gets a distinct ANSI
// color so interleaved output is easy to scan.
//
//   CLAUDEGUI_DEBUG=files,claude,project node server.js
//   CLAUDEGUI_DEBUG='*' node server.js
//
// Set CLAUDEGUI_TRACE=1 to print a short call stack with every `.trace(...)`
// call. Errors are always printed regardless of the debug filter.
//
// Color / emoji can be disabled with NO_COLOR=1.

const enabledSpec = (process.env.CLAUDEGUI_DEBUG || '').trim();
const enabledList = enabledSpec
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allEnabled = enabledList.includes('*') || enabledList.includes('all');

const traceEnabled = process.env.CLAUDEGUI_TRACE === '1' || process.env.CLAUDEGUI_TRACE === 'true';
const noColor = process.env.NO_COLOR === '1' || process.env.NO_COLOR === 'true';

const PALETTE = ['36', '35', '33', '32', '34', '31', '96', '95', '93', '92', '94', '91'];
const colorIndex = new Map();
let nextColor = 0;

function colorFor(name) {
  if (noColor) return '';
  let code = colorIndex.get(name);
  if (!code) {
    code = PALETTE[nextColor % PALETTE.length];
    colorIndex.set(name, code);
    nextColor += 1;
  }
  return code;
}

function paint(name, text) {
  const code = colorFor(name);
  if (!code) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

function isOn(name) {
  if (allEnabled) return true;
  for (const pattern of enabledList) {
    if (pattern === name) return true;
    if (pattern.endsWith('*') && name.startsWith(pattern.slice(0, -1))) return true;
    if (pattern.endsWith(':*') && name.startsWith(pattern.slice(0, -1))) return true;
  }
  return false;
}

function timestamp() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function stackSnippet() {
  const raw = new Error().stack || '';
  const lines = raw.split('\n').slice(3, 8); // skip Error, stackSnippet, caller, first frame
  return lines.map((l) => l.trim()).join('\n    ');
}

/**
 * Create a module-scoped logger.
 * @param {string} name  e.g. 'files', 'claude:query', 'terminal'
 */
export function createDebug(name) {
  const on = isOn(name);
  const tag = paint(name, `[${name}]`);

  const fmt = (level, levelColor, args) => {
    const ts = noColor ? timestamp() : `\x1b[90m${timestamp()}\x1b[0m`;
    const lvl = noColor ? level : `\x1b[${levelColor}m${level}\x1b[0m`;
    return [ts, lvl, tag, ...args];
  };

  return {
    enabled: on,
    log(...args) {
      if (!on) return;
      console.log(...fmt('LOG ', '37', args));
    },
    info(...args) {
      if (!on) return;
      console.info(...fmt('INFO', '36', args));
    },
    warn(...args) {
      if (!on) return;
      console.warn(...fmt('WARN', '33', args));
    },
    /** Errors are always printed, even when the module is filtered out. */
    error(...args) {
      console.error(...fmt('ERR ', '31', args));
      if (traceEnabled) {
        console.error('    ' + stackSnippet());
      }
    },
    /** Debug + (optional) short stack trace. */
    trace(...args) {
      if (!on) return;
      console.log(...fmt('TRC ', '35', args));
      if (traceEnabled) {
        console.log('    ' + stackSnippet());
      }
    },
  };
}

export const debugConfig = {
  enabledList: [...enabledList],
  allEnabled,
  traceEnabled,
  noColor,
};
