'use client';

import {
  File,
  FileText,
  FileCode,
  FileJson,
  Folder,
  FolderOpen,
  Image,
  FileType2,
} from 'lucide-react';

interface FileIconProps {
  name: string;
  isDirectory: boolean;
  isOpen?: boolean;
  className?: string;
}

const EXT_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  mjs: FileCode,
  cjs: FileCode,
  py: FileCode,
  go: FileCode,
  rs: FileCode,
  json: FileJson,
  md: FileText,
  markdown: FileText,
  txt: FileText,
  html: FileCode,
  css: FileCode,
  scss: FileCode,
  pdf: FileType2,
  png: Image,
  jpg: Image,
  jpeg: Image,
  gif: Image,
  svg: Image,
  webp: Image,
};

export function FileIcon({ name, isDirectory, isOpen, className }: FileIconProps) {
  if (isDirectory) {
    const Icon = isOpen ? FolderOpen : Folder;
    return <Icon className={className} />;
  }
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const Icon = EXT_MAP[ext] ?? File;
  return <Icon className={className} />;
}
