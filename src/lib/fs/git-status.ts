import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execAsync = promisify(exec);

export type GitFileStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted';

export interface GitStatus {
  branch: string | null;
  files: Record<string, GitFileStatus>;
}

function parsePorcelainLine(line: string): { path: string; status: GitFileStatus } | null {
  if (line.length < 3) return null;
  const code = line.slice(0, 2);
  const filePart = line.slice(3);

  let status: GitFileStatus | null = null;
  if (code === '??') status = 'untracked';
  else if (code.includes('U') || code === 'AA' || code === 'DD') status = 'conflicted';
  else if (code.includes('A')) status = 'added';
  else if (code.includes('D')) status = 'deleted';
  else if (code.includes('R')) status = 'renamed';
  else if (code.includes('M')) status = 'modified';

  if (!status) return null;

  // Handle rename: "old -> new"
  const arrow = filePart.indexOf(' -> ');
  const p = arrow >= 0 ? filePart.slice(arrow + 4) : filePart;
  return { path: p.trim(), status };
}

export async function getGitStatus(cwd: string): Promise<GitStatus> {
  try {
    const [{ stdout: branchOut }, { stdout: statusOut }] = await Promise.all([
      execAsync('git rev-parse --abbrev-ref HEAD', { cwd }).catch(() => ({ stdout: '' })),
      execAsync('git status --porcelain', { cwd }).catch(() => ({ stdout: '' })),
    ]);

    const branch = branchOut.trim() || null;
    const files: Record<string, GitFileStatus> = {};
    for (const line of statusOut.split('\n')) {
      const parsed = parsePorcelainLine(line);
      if (parsed) files[parsed.path] = parsed.status;
    }
    return { branch, files };
  } catch {
    return { branch: null, files: {} };
  }
}

export async function isGitRepository(cwd: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd });
    return true;
  } catch {
    return false;
  }
}

export function normalizePath(p: string): string {
  return p.split(path.sep).join('/');
}
