type AbortFn = (requestId: string) => void;

let abortFn: AbortFn | null = null;

export function registerAborter(fn: AbortFn): void {
  abortFn = fn;
}

export function abortRequest(requestId: string): boolean {
  if (!abortFn) return false;
  abortFn(requestId);
  return true;
}

export function __resetAborterForTests(): void {
  abortFn = null;
}
