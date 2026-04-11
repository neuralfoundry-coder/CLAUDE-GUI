'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { OnChange, OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { useEditorStore } from '@/stores/use-editor-store';
import { useLayoutStore } from '@/stores/use-layout-store';

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

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    html: 'html',
    css: 'css',
    scss: 'scss',
    py: 'python',
    go: 'go',
    rs: 'rust',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shell',
    bash: 'shell',
  };
  return map[ext] ?? 'plaintext';
}

interface MonacoEditorWrapperProps {
  tabId: string;
}

export function MonacoEditorWrapper({ tabId }: MonacoEditorWrapperProps) {
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === tabId));
  const updateContent = useEditorStore((s) => s.updateContent);
  const pendingReveal = useEditorStore((s) => s.pendingReveal);
  const clearPendingReveal = useEditorStore((s) => s.clearPendingReveal);
  const theme = useLayoutStore((s) => s.theme);
  const fontSize = useLayoutStore((s) => s.fontSize);
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

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    activeMonacoEditor = editor;
  };

  return (
    <Editor
      key={tabId}
      path={tab.path}
      language={getLanguage(tab.path)}
      value={tab.content}
      theme={theme === 'light' ? 'light' : 'vs-dark'}
      options={{
        fontSize,
        minimap: { enabled: true },
        fontFamily: 'JetBrains Mono, Menlo, monospace',
        readOnly: tab.locked,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        tabSize: 2,
      }}
      onChange={onChange}
      onMount={onMount}
    />
  );
}
