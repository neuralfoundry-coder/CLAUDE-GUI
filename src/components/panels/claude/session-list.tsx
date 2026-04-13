'use client';

import { useEffect, useState } from 'react';
import { GitBranch, Play, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { sessionsApi } from '@/lib/api-client';
import { useClaudeStore } from '@/stores/use-claude-store';

interface SessionSummary {
  id: string;
  name: string;
  cwd: string;
  lastUsedAt: string;
  totalCost: number;
  messageCount: number;
}

interface SessionListProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SessionList({ open, onOpenChange }: SessionListProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const createTab = useClaudeStore((s) => s.createTab);
  const loadSession = useClaudeStore((s) => s.loadSession);
  const setActiveSessionId = useClaudeStore((s) => s.setActiveSessionId);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = (await sessionsApi.list()) as unknown as { sessions: SessionSummary[] };
      setSessions(res.sessions || []);
    } catch (err) {
      console.error('[session-list] load failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const onResume = async (id: string) => {
    // Check if the active tab is empty (no messages, no session) — reuse it
    const s = useClaudeStore.getState();
    const activeTab = s.tabs.find((t) => t.id === s.activeTabId);
    const activeTs = s.activeTabId ? s.tabStates[s.activeTabId] : null;
    const isEmptyTab = activeTab && !activeTab.sessionId && (!activeTs || activeTs.messages.length === 0);

    if (!isEmptyTab) {
      // Create a new tab for the resumed session
      createTab({ name: id.slice(0, 12), sessionId: id });
    }
    await loadSession(id);
    onOpenChange(false);
  };

  const onFork = (id: string) => {
    // Fork: create a new tab with fork-of-{id} session marker.
    // Agent SDK will create a new session on the next query.
    createTab({ name: `Fork of ${id.slice(0, 8)}` });
    setActiveSessionId(`fork-of-${id}`);
    onOpenChange(false);
  };

  const onDelete = async (id: string) => {
    if (!confirm(`Delete session ${id}?`)) return;
    try {
      await sessionsApi.delete(id);
      await refresh();
    } catch (err) {
      alert(`Delete failed: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Claude Sessions</DialogTitle>
          <DialogDescription>
            Resume an existing session, fork it into a new conversation, or delete it.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {loading && (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
          )}
          {!loading && sessions.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No sessions found in ~/.claude/projects/
            </div>
          )}
          <ul className="divide-y">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-xs">{s.id}</span>
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {s.cwd} · {s.messageCount} msgs · ${s.totalCost.toFixed(4)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    title="Resume"
                    aria-label={`Resume session ${s.name}`}
                    onClick={() => onResume(s.id)}
                  >
                    <Play className="h-3 w-3" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Fork"
                    aria-label={`Fork session ${s.name}`}
                    onClick={() => onFork(s.id)}
                  >
                    <GitBranch className="h-3 w-3" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Delete"
                    aria-label={`Delete session ${s.name}`}
                    onClick={() => onDelete(s.id)}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={refresh}>
            Refresh
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-1 h-4 w-4" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
