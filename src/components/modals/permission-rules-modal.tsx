'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Settings {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
}

interface PermissionRulesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

async function loadSettings(): Promise<Settings> {
  const res = await fetch('/api/settings');
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return (json.data.settings ?? {}) as Settings;
}

async function saveSettings(s: Settings): Promise<void> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(s),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

export function PermissionRulesModal({ open, onOpenChange }: PermissionRulesModalProps) {
  const [allow, setAllow] = useState<string[]>([]);
  const [deny, setDeny] = useState<string[]>([]);
  const [newAllow, setNewAllow] = useState('');
  const [newDeny, setNewDeny] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    loadSettings()
      .then((s) => {
        setAllow(s.permissions?.allow ?? []);
        setDeny(s.permissions?.deny ?? []);
      })
      .catch((err: Error) => setError(err.message));
  }, [open]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveSettings({ permissions: { allow, deny } });
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addAllow = () => {
    if (!newAllow.trim()) return;
    setAllow([...allow, newAllow.trim()]);
    setNewAllow('');
  };

  const addDeny = () => {
    if (!newDeny.trim()) return;
    setDeny([...deny, newDeny.trim()]);
    setNewDeny('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Permission Rules</DialogTitle>
          <DialogDescription>
            Edit <code>.claude/settings.json</code> allow/deny rules. Examples:{' '}
            <code>Bash(npm test:*)</code>, <code>Edit</code>, <code>Read(~/**)</code>.
          </DialogDescription>
        </DialogHeader>

        {error && <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Allow</h3>
          <ul className="space-y-1">
            {allow.length === 0 && (
              <li className="text-xs text-muted-foreground">No rules. Claude asks for every tool use.</li>
            )}
            {allow.map((rule, i) => (
              <li key={`a-${i}`} className="flex items-center gap-2 text-xs">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1">{rule}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove allow rule ${rule}`}
                  onClick={() => setAllow(allow.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={newAllow}
              onChange={(e) => setNewAllow(e.target.value)}
              placeholder="e.g. Bash(ls:*)"
              aria-label="New allow rule"
              className="flex-1 rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addAllow();
                }
              }}
            />
            <Button size="icon" onClick={addAllow} aria-label="Add allow rule">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Deny</h3>
          <ul className="space-y-1">
            {deny.length === 0 && <li className="text-xs text-muted-foreground">No deny rules.</li>}
            {deny.map((rule, i) => (
              <li key={`d-${i}`} className="flex items-center gap-2 text-xs">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1">{rule}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove deny rule ${rule}`}
                  onClick={() => setDeny(deny.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={newDeny}
              onChange={(e) => setNewDeny(e.target.value)}
              placeholder="e.g. Bash(rm:*)"
              aria-label="New deny rule"
              className="flex-1 rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDeny();
                }
              }}
            />
            <Button size="icon" onClick={addDeny} aria-label="Add deny rule">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
