'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { OnChange, OnMount } from '@monaco-editor/react';
import { useEditorStore } from '@/stores/use-editor-store';
import { useLayoutStore } from '@/stores/use-layout-store';

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
  const theme = useLayoutStore((s) => s.theme);
  const fontSize = useLayoutStore((s) => s.fontSize);
  const editorRef = useRef<unknown>(null);

  useEffect(() => {
    // placeholder for model sync logic
  }, [tabId]);

  if (!tab) return null;

  const onChange: OnChange = (value) => {
    if (value !== undefined) updateContent(tab.id, value);
  };

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
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
