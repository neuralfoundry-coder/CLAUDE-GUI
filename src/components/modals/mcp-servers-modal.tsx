'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Pencil, Power, PowerOff, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMcpStore } from '@/stores/use-mcp-store';
import type { McpServerEntry, McpServerConfig } from '@/lib/claude/settings-manager';

/* ------------------------------------------------------------------ */
/*  Preset templates for popular MCP servers                          */
/* ------------------------------------------------------------------ */

interface PresetTemplate {
  name: string;
  description: string;
  config: McpServerConfig;
}

const PRESETS: PresetTemplate[] = [
  {
    name: 'filesystem',
    description: 'Local filesystem access',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
  },
  {
    name: 'github',
    description: 'GitHub API integration',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' } },
  },
  {
    name: 'brave-search',
    description: 'Brave Search API',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], env: { BRAVE_API_KEY: '' } },
  },
  {
    name: 'slack',
    description: 'Slack workspace integration',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'], env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' } },
  },
  {
    name: 'postgres',
    description: 'PostgreSQL database access',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'] },
  },
];

/* ------------------------------------------------------------------ */
/*  Types for form state                                              */
/* ------------------------------------------------------------------ */

type ServerType = 'stdio' | 'sse' | 'http';

interface FormState {
  name: string;
  type: ServerType;
  description: string;
  // stdio fields
  command: string;
  args: string;
  env: { key: string; value: string }[];
  // url-based fields (sse/http)
  url: string;
  headers: { key: string; value: string }[];
}

const EMPTY_FORM: FormState = {
  name: '',
  type: 'stdio',
  description: '',
  command: '',
  args: '',
  env: [],
  url: '',
  headers: [],
};

function entryToForm(name: string, entry: McpServerEntry): FormState {
  const cfg = entry.config;
  const base: FormState = {
    ...EMPTY_FORM,
    name,
    description: entry.description ?? '',
  };
  if (!cfg.type || cfg.type === 'stdio') {
    return {
      ...base,
      type: 'stdio',
      command: cfg.command,
      args: (cfg.args ?? []).join(' '),
      env: Object.entries(cfg.env ?? {}).map(([key, value]) => ({ key, value })),
    };
  }
  const urlCfg = cfg as { type: 'sse' | 'http'; url: string; headers?: Record<string, string> };
  return {
    ...base,
    type: urlCfg.type,
    url: urlCfg.url,
    headers: Object.entries(urlCfg.headers ?? {}).map(([key, value]) => ({ key, value: String(value) })),
  };
}

function formToEntry(form: FormState, enabled: boolean): McpServerEntry {
  let config: McpServerConfig;
  if (form.type === 'stdio') {
    const env: Record<string, string> = {};
    for (const { key, value } of form.env) {
      if (key.trim()) env[key.trim()] = value;
    }
    config = {
      type: 'stdio',
      command: form.command.trim(),
      args: form.args.trim() ? form.args.trim().split(/\s+/) : undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
    };
  } else {
    const headers: Record<string, string> = {};
    for (const { key, value } of form.headers) {
      if (key.trim()) headers[key.trim()] = value;
    }
    config = {
      type: form.type,
      url: form.url.trim(),
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    };
  }
  return {
    enabled,
    description: form.description.trim() || undefined,
    config,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

interface McpServersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function McpServersModal({ open, onOpenChange }: McpServersModalProps) {
  const {
    servers,
    statuses,
    loading,
    fetchServers,
    fetchStatus,
    saveServers,
    addServer,
    removeServer,
    toggleServer,
    updateServer,
  } = useMcpStore();

  const [editing, setEditing] = useState<string | null>(null); // server name being edited
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);

  useEffect(() => {
    if (open) {
      fetchServers();
      fetchStatus();
      setEditing(null);
      setAdding(false);
      setError(null);
    }
  }, [open, fetchServers, fetchStatus]);

  const statusMap = new Map(statuses.map((s) => [s.name, s.status]));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const ok = await saveServers(servers);
    setSaving(false);
    if (!ok) {
      setError('Failed to save MCP server configuration');
      return;
    }
    onOpenChange(false);
  };

  const startAdd = useCallback(() => {
    setAdding(true);
    setEditing(null);
    setForm(EMPTY_FORM);
  }, []);

  const startEdit = useCallback((name: string) => {
    const entry = servers[name];
    if (!entry) return;
    setEditing(name);
    setAdding(false);
    setForm(entryToForm(name, entry));
  }, [servers]);

  const applyPreset = useCallback((preset: PresetTemplate) => {
    setAdding(true);
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      name: preset.name,
      description: preset.description,
      type: (preset.config.type ?? 'stdio') as ServerType,
      command: 'command' in preset.config ? preset.config.command : '',
      args: 'args' in preset.config ? (preset.config.args ?? []).join(' ') : '',
      env: 'env' in preset.config
        ? Object.entries(preset.config.env ?? {}).map(([key, value]) => ({ key, value }))
        : [],
      url: 'url' in preset.config ? preset.config.url : '',
      headers: 'headers' in preset.config
        ? Object.entries(preset.config.headers ?? {}).map(([key, value]) => ({ key, value }))
        : [],
    });
    setPresetOpen(false);
  }, []);

  const confirmForm = useCallback(() => {
    if (!form.name.trim()) return;
    if (form.type === 'stdio' && !form.command.trim()) return;
    if ((form.type === 'sse' || form.type === 'http') && !form.url.trim()) return;

    const entry = formToEntry(form, true);
    if (editing) {
      // If name changed, remove old and add new
      if (editing !== form.name.trim()) {
        removeServer(editing);
      }
      updateServer(form.name.trim(), entry);
    } else {
      addServer(form.name.trim(), entry);
    }
    setAdding(false);
    setEditing(null);
  }, [form, editing, addServer, updateServer, removeServer]);

  const cancelForm = useCallback(() => {
    setAdding(false);
    setEditing(null);
  }, []);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const serverEntries = Object.entries(servers);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>MCP Servers</DialogTitle>
          <DialogDescription>
            Configure external tool servers for Claude via Model Context Protocol.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2 min-h-0">
          {/* Server list */}
          {serverEntries.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No MCP servers configured. Add one to get started.
            </p>
          )}

          {serverEntries.map(([name, entry]) => {
            const status = statusMap.get(name);
            const isEditing = editing === name;
            if (isEditing) return null; // show form instead

            return (
              <div
                key={name}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                {/* Status dot */}
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    status === 'connected'
                      ? 'bg-green-500'
                      : status === 'failed'
                        ? 'bg-red-500'
                        : status === 'pending'
                          ? 'bg-yellow-500'
                          : 'bg-zinc-400'
                  }`}
                  title={status ?? 'unknown'}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {entry.config.type ?? 'stdio'}
                    </span>
                  </div>
                  {entry.description && (
                    <p className="text-xs text-muted-foreground truncate">{entry.description}</p>
                  )}
                </div>

                {/* Actions */}
                <button
                  className="p-1 hover:bg-muted rounded"
                  onClick={() => toggleServer(name)}
                  title={entry.enabled ? 'Disable' : 'Enable'}
                >
                  {entry.enabled ? (
                    <Power className="h-4 w-4 text-green-500" />
                  ) : (
                    <PowerOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <button
                  className="p-1 hover:bg-muted rounded"
                  onClick={() => startEdit(name)}
                  title="Edit"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  className="p-1 hover:bg-muted rounded"
                  onClick={() => removeServer(name)}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4 text-red-400" />
                </button>
              </div>
            );
          })}

          {/* Inline form (add or edit) */}
          {(adding || editing) && (
            <div className="space-y-3 rounded-md border p-3">
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <input
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  placeholder="my-server"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                />
              </div>

              {/* Type */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <select
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  value={form.type}
                  onChange={(e) => updateField('type', e.target.value as ServerType)}
                >
                  <option value="stdio">stdio (local command)</option>
                  <option value="sse">SSE (Server-Sent Events)</option>
                  <option value="http">HTTP (Streamable HTTP)</option>
                </select>
              </div>

              {/* Type-specific fields */}
              {form.type === 'stdio' ? (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Command</label>
                    <input
                      className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                      placeholder="npx"
                      value={form.command}
                      onChange={(e) => updateField('command', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Arguments (space-separated)</label>
                    <input
                      className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                      placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
                      value={form.args}
                      onChange={(e) => updateField('args', e.target.value)}
                    />
                  </div>
                  {/* Env vars */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Environment Variables
                    </label>
                    {form.env.map((pair, i) => (
                      <div key={i} className="flex gap-2 mt-1">
                        <input
                          className="flex-1 rounded border bg-background px-2 py-1 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                          placeholder="KEY"
                          value={pair.key}
                          onChange={(e) => {
                            const next = [...form.env];
                            next[i] = { key: e.target.value, value: pair.value };
                            updateField('env', next);
                          }}
                        />
                        <input
                          className="flex-1 rounded border bg-background px-2 py-1 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                          placeholder="value"
                          type="password"
                          value={pair.value}
                          onChange={(e) => {
                            const next = [...form.env];
                            next[i] = { key: pair.key, value: e.target.value };
                            updateField('env', next);
                          }}
                        />
                        <button
                          className="p-1 hover:bg-muted rounded"
                          onClick={() => {
                            const next = form.env.filter((_, j) => j !== i);
                            updateField('env', next);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      </div>
                    ))}
                    <button
                      className="mt-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      onClick={() => updateField('env', [...form.env, { key: '', value: '' }])}
                    >
                      <Plus className="h-3 w-3" /> Add variable
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">URL</label>
                    <input
                      className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                      placeholder="https://example.com/mcp"
                      value={form.url}
                      onChange={(e) => updateField('url', e.target.value)}
                    />
                  </div>
                  {/* Headers */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Headers</label>
                    {form.headers.map((pair, i) => (
                      <div key={i} className="flex gap-2 mt-1">
                        <input
                          className="flex-1 rounded border bg-background px-2 py-1 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                          placeholder="Header-Name"
                          value={pair.key}
                          onChange={(e) => {
                            const next = [...form.headers];
                            next[i] = { key: e.target.value, value: pair.value };
                            updateField('headers', next);
                          }}
                        />
                        <input
                          className="flex-1 rounded border bg-background px-2 py-1 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                          placeholder="value"
                          type="password"
                          value={pair.value}
                          onChange={(e) => {
                            const next = [...form.headers];
                            next[i] = { key: pair.key, value: e.target.value };
                            updateField('headers', next);
                          }}
                        />
                        <button
                          className="p-1 hover:bg-muted rounded"
                          onClick={() => {
                            const next = form.headers.filter((_, j) => j !== i);
                            updateField('headers', next);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      </div>
                    ))}
                    <button
                      className="mt-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      onClick={() => updateField('headers', [...form.headers, { key: '', value: '' }])}
                    >
                      <Plus className="h-3 w-3" /> Add header
                    </button>
                  </div>
                </>
              )}

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
                <input
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  placeholder="What this server does"
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                />
              </div>

              {/* Form buttons */}
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={cancelForm}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={confirmForm}
                  disabled={
                    !form.name.trim() ||
                    (form.type === 'stdio' && !form.command.trim()) ||
                    (form.type !== 'stdio' && !form.url.trim())
                  }
                >
                  {editing ? 'Update' : 'Add'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-500 px-1">{error}</p>}

        <DialogFooter className="flex items-center gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            {/* Add button */}
            <Button variant="outline" size="sm" onClick={startAdd} disabled={adding || !!editing}>
              <Plus className="h-4 w-4 mr-1" /> Add Server
            </Button>

            {/* Preset dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPresetOpen(!presetOpen)}
                disabled={adding || !!editing}
              >
                Quick Add <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
              {presetOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-56 rounded-md border bg-popover p-1 shadow-md z-50">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted"
                      onClick={() => applyPreset(p)}
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
