'use client';

import { useGitStatus } from './use-git-status';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  modified: { label: 'M', className: 'text-yellow-500' },
  added: { label: 'A', className: 'text-green-500' },
  deleted: { label: 'D', className: 'text-red-500' },
  untracked: { label: 'U', className: 'text-green-400' },
  renamed: { label: 'R', className: 'text-blue-500' },
  conflicted: { label: '!', className: 'text-red-600' },
};

interface GitStatusIndicatorProps {
  path: string;
}

export function GitStatusIndicator({ path }: GitStatusIndicatorProps) {
  const { statusMap } = useGitStatus();
  const status = statusMap[path];
  if (!status) return null;
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  return (
    <span className={cn('text-[10px] font-bold leading-none', config.className)}>
      {config.label}
    </span>
  );
}
