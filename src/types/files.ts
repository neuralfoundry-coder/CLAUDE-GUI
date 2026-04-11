export type EntryType = 'file' | 'directory' | 'symlink' | 'other';

export interface FileEntry {
  name: string;
  type: EntryType;
  size: number;
  mtime: string;
}

export interface FileStat {
  size: number;
  mtime: string;
  ctime: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  code: number;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
