import type { ApiResponse, FileEntry, FileStat } from '@/types/files';

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
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

  delete(path: string): Promise<{ deleted: string }> {
    return apiFetch(`/api/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
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
};

export const sessionsApi = {
  list(): Promise<{ sessions: Array<{ id: string; name: string; totalCost: number }> }> {
    return apiFetch('/api/sessions');
  },

  create(body: { name?: string; cwd?: string }): Promise<{ sessionId: string }> {
    return apiFetch('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  get(id: string): Promise<unknown> {
    return apiFetch(`/api/sessions/${id}`);
  },

  delete(id: string): Promise<{ deleted: string }> {
    return apiFetch(`/api/sessions/${id}`, { method: 'DELETE' });
  },
};
