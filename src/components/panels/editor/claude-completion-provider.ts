import type { editor as MonacoEditor, languages, CancellationToken, IPosition } from 'monaco-editor';
import { getClaudeClient } from '@/lib/websocket/claude-client';
import { useEditorStore } from '@/stores/use-editor-store';
import { useSettingsStore } from '@/stores/use-settings-store';

/** Maximum number of lines to send before/after the cursor. */
const PREFIX_LINES = 100;
const SUFFIX_LINES = 30;

let registered = false;
let currentAbort: AbortController | null = null;

/**
 * Register the Claude-powered inline completion provider with Monaco.
 * Safe to call multiple times — only registers once.
 */
export function registerClaudeCompletionProvider(
  monaco: typeof import('monaco-editor'),
): void {
  if (registered) return;
  registered = true;

  monaco.languages.registerInlineCompletionsProvider('*', {
    provideInlineCompletions,
    freeInlineCompletions() {
      // Nothing to free
    },
  });
}

async function provideInlineCompletions(
  model: MonacoEditor.ITextModel,
  position: IPosition,
  _context: languages.InlineCompletionContext,
  token: CancellationToken,
): Promise<languages.InlineCompletions> {
  const empty: languages.InlineCompletions = { items: [] };

  // Check if completion is enabled
  if (!useSettingsStore.getState().editorCompletionEnabled) return empty;

  // Cancel previous in-flight request
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }

  // Debounce: wait for the configured delay
  const delay = useSettingsStore.getState().editorCompletionDelay;
  const aborted = await waitOrCancel(delay, token);
  if (aborted) return empty;

  // Extract context around the cursor
  const totalLines = model.getLineCount();
  const prefixStartLine = Math.max(1, position.lineNumber - PREFIX_LINES);
  const suffixEndLine = Math.min(totalLines, position.lineNumber + SUFFIX_LINES);

  const prefix = model.getValueInRange({
    startLineNumber: prefixStartLine,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });

  const suffix = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: position.column,
    endLineNumber: suffixEndLine,
    endColumn: model.getLineMaxColumn(suffixEndLine),
  });

  // Skip if there's too little context (e.g. empty file)
  if (prefix.trim().length < 5) return empty;

  const filePath = model.uri.path;
  const language = model.getLanguageId();
  const requestId = `cmp-${Date.now()}`;

  // Set up abort for this request
  const abort = new AbortController();
  currentAbort = abort;

  useEditorStore.getState().setCompletionLoading(true);

  try {
    const completions = await requestCompletion(
      requestId,
      filePath,
      language,
      prefix,
      suffix,
      token,
      abort.signal,
    );

    if (token.isCancellationRequested || abort.signal.aborted) return empty;

    return {
      items: completions
        .filter((text) => text.length > 0)
        .map((text) => ({
          insertText: text,
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
        })),
    };
  } finally {
    useEditorStore.getState().setCompletionLoading(false);
    if (currentAbort === abort) currentAbort = null;
  }
}

function requestCompletion(
  requestId: string,
  filePath: string,
  language: string,
  prefix: string,
  suffix: string,
  token: CancellationToken,
  signal: AbortSignal,
): Promise<string[]> {
  return new Promise<string[]>((resolve) => {
    const client = getClaudeClient();

    // Resolve with empty on cancellation
    const onCancel = () => resolve([]);
    token.onCancellationRequested(onCancel);
    signal.addEventListener('abort', onCancel, { once: true });

    client.onCompletionResponse(requestId, (completions) => {
      resolve(completions);
    });

    client.sendCompletionRequest(requestId, filePath, language, prefix, suffix);
  });
}

function waitOrCancel(ms: number, token: CancellationToken): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (token.isCancellationRequested) {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => resolve(false), ms);
    token.onCancellationRequested(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}
