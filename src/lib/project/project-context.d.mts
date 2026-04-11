export declare function getActiveRoot(): string;
export declare function getRecents(): string[];
export declare function setActiveRoot(newRoot: string): string;
export declare function onActiveRootChange(listener: (root: string) => void): () => void;
export declare function validateProjectRoot(absPath: string): void;

export declare class ProjectRootError extends Error {
  readonly code: number;
  constructor(message: string, code?: number);
}
