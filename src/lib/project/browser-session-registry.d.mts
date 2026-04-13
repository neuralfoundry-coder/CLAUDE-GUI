export interface BrowserSessionRegistry {
  getRoot(browserId: string | null): string | null;
  setRoot(browserId: string | null, newRoot: string): string;
  touch(browserId: string | null): void;
  ensureSession(browserId: string | null): void;
  scheduleGc(browserId: string | null): void;
  onAnyRootChange(
    listener: (browserId: string, newRoot: string, oldRoot: string | null) => void,
  ): () => void;
  getRecents(): string[];
  has(browserId: string): boolean;
  size(): number;
}

export declare const browserSessionRegistry: BrowserSessionRegistry;

export declare const BROWSER_SESSION_CONSTANTS: Readonly<{
  GC_TIMEOUT_MS: number;
  GC_SWEEP_INTERVAL_MS: number;
}>;
