import type { ApiResponse, FileEntry, FileStat } from '@/types/files';

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  // FormData must not carry an explicit content-type — the browser sets the
  // multipart boundary automatically.
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'content-type': 'application/json' }),
      ...(init?.headers || {}),
    },
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error(json.error);
  }
  return json.data;
}

export const filesApi = {
  list(path: string): Promise<{ path: string; entries: FileEntry[] }> {
    return apiFetch(`/api/files?path=${encodeURIComponent(path)}`);
  },

  read(path: string): Promise<{ content: string; encoding: string; size: number }> {
    return apiFetch(`/api/files/read?path=${encodeURIComponent(path)}`);
  },

  write(path: string, content: string): Promise<{ size: number }> {
    return apiFetch('/api/files/write', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    });
  },

  delete(path: string, options: { recursive?: boolean } = {}): Promise<{ deleted: string }> {
    const qs = new URLSearchParams({ path });
    if (options.recursive) qs.set('recursive', '1');
    return apiFetch(`/api/files?${qs.toString()}`, { method: 'DELETE' });
  },

  copy(
    srcPath: string,
    destPath: string,
  ): Promise<{ srcPath: string; destPath: string; writtenPath: string }> {
    return apiFetch('/api/files/copy', {
      method: 'POST',
      body: JSON.stringify({ srcPath, destPath }),
    });
  },

  mkdir(path: string): Promise<{ created: string }> {
    return apiFetch('/api/files/mkdir', {
      method: 'POST',
      body: JSON.stringify({ path, recursive: true }),
    });
  },

  rename(oldPath: string, newPath: string): Promise<{ oldPath: string; newPath: string }> {
    return apiFetch('/api/files/rename', {
      method: 'POST',
      body: JSON.stringify({ oldPath, newPath }),
    });
  },

  stat(path: string): Promise<FileStat> {
    return apiFetch(`/api/files/stat?path=${encodeURIComponent(path)}`);
  },

  reveal(path: string): Promise<{ revealed: string; platform: string }> {
    return apiFetch('/api/files/reveal', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  },

  upload(
    destDir: string,
    files: File[],
  ): Promise<{
    uploaded: Array<{ name: string; size: number; writtenPath: string }>;
  }> {
    const fd = new FormData();
    fd.set('destDir', destDir);
    for (const f of files) {
      // Preserve the filename explicitly — some File objects originating
      // from DataTransferItem.getAsFile() report an empty name otherwise.
      fd.append('files', f, f.name);
    }
    return apiFetch('/api/files/upload', { method: 'POST', body: fd });
  },
};

export const terminalApi = {
  openNative(
    cwd?: string,
  ): Promise<{ launcher: string; cwd: string; platform: string }> {
    return apiFetch('/api/terminal/open-native', {
      method: 'POST',
      body: JSON.stringify(cwd ? { cwd } : {}),
    });
  },
};

export interface SessionHistoryMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
}

export interface SessionSummary {
  id: string;
  name: string;
  cwd: string;
  createdAt: string;
  lastUsedAt: string;
  totalCost: number;
  messageCount: number;
}

export interface SessionDetail extends SessionSummary {
  history: SessionHistoryMessage[];
}

export const projectApi = {
  get(): Promise<{ root: string; recents: string[] }> {
    return apiFetch('/api/project');
  },
  set(path: string): Promise<{ root: string; recents: string[] }> {
    return apiFetch('/api/project', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  },
};

export const sessionsApi = {
  list(): Promise<{ sessions: SessionSummary[] }> {
    return apiFetch('/api/sessions');
  },

  create(body: { name?: string; cwd?: string }): Promise<{ sessionId: string }> {
    return apiFetch('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  get(id: string): Promise<SessionDetail> {
    return apiFetch(`/api/sessions/${id}`);
  },

  delete(id: string): Promise<{ deleted: string }> {
    return apiFetch(`/api/sessions/${id}`, { method: 'DELETE' });
  },
};
