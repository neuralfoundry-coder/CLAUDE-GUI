'use client';

import dynamic from 'next/dynamic';
import type { DiffOnMount } from '@monaco-editor/react';
import { useLayoutStore } from '@/stores/use-layout-store';
import { useResolvedTheme } from '@/hooks/use-theme';

const DiffEditor = dynamic(() => import('@monaco-editor/react').then((m) => m.DiffEditor), {
  ssr: false,
});

interface MonacoDiffWrapperProps {
  original: string;
  modified: string;
  language: string;
}

export function MonacoDiffWrapper({ original, modified, language }: MonacoDiffWrapperProps) {
  const resolvedTheme = useResolvedTheme();
  const baseFontSize = useLayoutStore((s) => s.fontSize);
  const editorZoom = useLayoutStore((s) => s.panelZoom.editor);
  const fontSize = Math.round(baseFontSize * editorZoom);

  const onMount: DiffOnMount = () => {
    /* no-op */
  };

  return (
    <DiffEditor
      original={original}
      modified={modified}
      language={language}
      theme={resolvedTheme === 'light' ? 'light' : 'vs-dark'}
      options={{
        readOnly: true,
        renderSideBySide: true,
        fontSize,
        fontFamily: 'JetBrains Mono, Menlo, monospace',
        automaticLayout: true,
        scrollBeyondLastLine: false,
      }}
      onMount={onMount}
    />
  );
}
