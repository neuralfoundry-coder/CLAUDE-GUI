export interface DiffHunk {
  id: string;
  originalStart: number;
  originalEnd: number;
  modifiedStart: number;
  modifiedEnd: number;
  originalLines: string[];
  modifiedLines: string[];
}

interface Op {
  type: 'equal' | 'delete' | 'insert';
  line: string;
  aIndex?: number;
  bIndex?: number;
}

function splitLines(text: string): string[] {
  return text.split('\n');
}

function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      else dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  return dp;
}

function backtrace(a: string[], b: string[], dp: number[][]): Op[] {
  const ops: Op[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.unshift({ type: 'equal', line: a[i - 1]!, aIndex: i - 1, bIndex: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      ops.unshift({ type: 'delete', line: a[i - 1]!, aIndex: i - 1 });
      i--;
    } else {
      ops.unshift({ type: 'insert', line: b[j - 1]!, bIndex: j - 1 });
      j--;
    }
  }
  while (i > 0) {
    ops.unshift({ type: 'delete', line: a[i - 1]!, aIndex: i - 1 });
    i--;
  }
  while (j > 0) {
    ops.unshift({ type: 'insert', line: b[j - 1]!, bIndex: j - 1 });
    j--;
  }
  return ops;
}

export function computeHunks(original: string, modified: string): DiffHunk[] {
  if (original === modified) return [];
  const a = splitLines(original);
  const b = splitLines(modified);
  const dp = computeLCS(a, b);
  const ops = backtrace(a, b, dp);

  const hunks: DiffHunk[] = [];
  let i = 0;
  let originalCursor = 0;
  let modifiedCursor = 0;

  while (i < ops.length) {
    const op = ops[i]!;
    if (op.type === 'equal') {
      originalCursor++;
      modifiedCursor++;
      i++;
      continue;
    }

    // Start of a hunk
    const originalStart = originalCursor;
    const modifiedStart = modifiedCursor;
    const originalLines: string[] = [];
    const modifiedLines: string[] = [];

    while (i < ops.length && ops[i]!.type !== 'equal') {
      if (ops[i]!.type === 'delete') {
        originalLines.push(ops[i]!.line);
        originalCursor++;
      } else {
        modifiedLines.push(ops[i]!.line);
        modifiedCursor++;
      }
      i++;
    }

    hunks.push({
      id: `h-${hunks.length}-${originalStart}-${modifiedStart}`,
      originalStart,
      originalEnd: originalStart + originalLines.length,
      modifiedStart,
      modifiedEnd: modifiedStart + modifiedLines.length,
      originalLines,
      modifiedLines,
    });
  }

  return hunks;
}

export function applyHunks(
  original: string,
  hunks: DiffHunk[],
  acceptedIds: ReadonlySet<string>,
): string {
  const originalLines = splitLines(original);
  const result: string[] = [];
  let i = 0;

  const sorted = [...hunks].sort((a, b) => a.originalStart - b.originalStart);

  for (const hunk of sorted) {
    while (i < hunk.originalStart) {
      result.push(originalLines[i]!);
      i++;
    }
    if (acceptedIds.has(hunk.id)) {
      result.push(...hunk.modifiedLines);
    } else {
      result.push(...hunk.originalLines);
    }
    i = hunk.originalEnd;
  }
  while (i < originalLines.length) {
    result.push(originalLines[i]!);
    i++;
  }

  return result.join('\n');
}
