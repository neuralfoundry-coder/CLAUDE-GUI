'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { OnChange, OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { useEditorStore } from '@/stores/use-editor-store';
import { useLayoutStore } from '@/stores/use-layout-store';
import { useSettingsStore } from '@/stores/use-settings-store';
import { getLanguageFromPath } from '@/lib/editor/language-map';
import { configureMonacoLoader } from '@/lib/editor/monaco-loader-config';
import { useResolvedTheme } from '@/hooks/use-theme';
import { registerClaudeCompletionProvider } from './claude-completion-provider';

// Configure Monaco loader once at module level (before dynamic import).
configureMonacoLoader();

/**
 * Module-level reference to the currently mounted Monaco editor so that
 * window-level keyboard shortcuts (e.g. "run selection in terminal") can
 * read the live selection without routing through React.
 */
let activeMonacoEditor: MonacoEditor.IStandaloneCodeEditor | null = null;

export function getActiveMonacoEditor(): MonacoEditor.IStandaloneCodeEditor | null {
  return activeMonacoEditor;
}

/**
 * Returns the current text selection, or the text of the current line if
 * there is no selection. Returns an empty string when no editor is mounted.
 */
export function getActiveEditorSelectionOrLine(): string {
  const ed = activeMonacoEditor;
  if (!ed) return '';
  const model = ed.getModel();
  if (!model) return '';
  const sel = ed.getSelection();
  if (!sel || sel.isEmpty()) {
    const pos = ed.getPosition();
    if (!pos) return '';
    return model.getLineContent(pos.lineNumber);
  }
  return model.getValueInRange(sel);
}

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex flex-col gap-1 p-4">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-6 text-right text-xs text-muted-foreground/30">{i + 1}</span>
            <div
              className="h-3 animate-pulse rounded bg-muted-foreground/10"
              style={{ width: `${30 + ((i * 37) % 50)}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  ),
});

interface MonacoEditorWrapperProps {
  tabId: string;
}

export function MonacoEditorWrapper({ tabId }: MonacoEditorWrapperProps) {
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === tabId));
  const updateContent = useEditorStore((s) => s.updateContent);
  const pendingReveal = useEditorStore((s) => s.pendingReveal);
  const clearPendingReveal = useEditorStore((s) => s.clearPendingReveal);
  const setCursorPosition = useEditorStore((s) => s.setCursorPosition);
  const resolvedTheme = useResolvedTheme();
  const baseFontSize = useLayoutStore((s) => s.fontSize);
  const editorZoom = useLayoutStore((s) => s.panelZoom.editor);
  const fontSize = Math.round(baseFontSize * editorZoom);

  // Editor settings from settings store
  const wordWrap = useSettingsStore((s) => s.editorWordWrap);
  const tabSize = useSettingsStore((s) => s.editorTabSize);
  const useSpaces = useSettingsStore((s) => s.editorUseSpaces);
  const minimapEnabled = useSettingsStore((s) => s.editorMinimapEnabled);
  const renderWhitespace = useSettingsStore((s) => s.editorRenderWhitespace);
  const stickyScroll = useSettingsStore((s) => s.editorStickyScroll);
  const bracketColors = useSettingsStore((s) => s.editorBracketColors);

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  // Apply reveal requests coming from the terminal link provider, etc.
  useEffect(() => {
    if (!pendingReveal || !tab) return;
    if (pendingReveal.path !== tab.path) return;
    const ed = editorRef.current;
    if (!ed) return;
    const line = Math.max(1, pendingReveal.line ?? 1);
    const col = Math.max(1, pendingReveal.col ?? 1);
    ed.revealLineInCenter(line);
    ed.setPosition({ lineNumber: line, column: col });
    ed.focus();
    clearPendingReveal();
  }, [pendingReveal, tab, clearPendingReveal]);

  useEffect(() => {
    return () => {
      if (activeMonacoEditor === editorRef.current) {
        activeMonacoEditor = null;
      }
    };
  }, []);

  if (!tab) return null;

  const onChange: OnChange = (value) => {
    if (value !== undefined) updateContent(tab.id, value);
  };

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    activeMonacoEditor = editor;

    // Track cursor position for the header bar
    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition(e.position.lineNumber, e.position.column);
    });

    // Report initial cursor position
    const pos = editor.getPosition();
    if (pos) {
      setCursorPosition(pos.lineNumber, pos.column);
    }

    // Register Claude inline completion provider (once)
    registerClaudeCompletionProvider(monaco);

    // Alt+Z: Toggle word wrap
    editor.addAction({
      id: 'claudegui.toggleWordWrap',
      label: 'Toggle Word Wrap',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
      run: () => {
        const current = useSettingsStore.getState().editorWordWrap;
        useSettingsStore.getState().setEditorWordWrap(!current);
      },
    });
  };

  return (
    <Editor
      key={tabId}
      path={tab.path}
      language={getLanguageFromPath(tab.path)}
      value={tab.content}
      theme={resolvedTheme === 'light' ? 'light' : 'vs-dark'}
      options={{
        fontSize,
        fontFamily: 'JetBrains Mono, Menlo, monospace',
        readOnly: tab.locked,
        automaticLayout: true,
        scrollBeyondLastLine: false,

        // Tab / indentation
        tabSize,
        insertSpaces: useSpaces,
        detectIndentation: true,

        // Minimap
        minimap: { enabled: minimapEnabled },

        // Bracket matching & colorization
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        bracketPairColorization: { enabled: bracketColors },
        guides: { bracketPairs: true, indentation: true },

        // Code folding
        folding: true,
        foldingStrategy: 'indentation',
        showFoldingControls: 'mouseover',

        // Find & replace
        find: {
          addExtraSpaceOnTop: true,
          seedSearchStringFromSelection: 'selection',
        },

        // Word wrap
        wordWrap: wordWrap ? 'on' : 'off',

        // Multi-cursor
        multiCursorModifier: 'alt',

        // Scrolling
        smoothScrolling: true,

        // Linked editing (rename)
        linkedEditing: true,

        // Sticky scroll (current scope header)
        stickyScroll: { enabled: stickyScroll },

        // Rendering
        renderWhitespace,
        renderLineHighlight: 'all',
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
      }}
      onChange={onChange}
      onMount={onMount}
    />
  );
}
