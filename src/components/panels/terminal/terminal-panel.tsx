'use client';

import { useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTerminalStore } from '@/stores/use-terminal-store';
import { XTerminal } from './x-terminal';

export function TerminalPanel() {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const createSession = useTerminalStore((s) => s.createSession);
  const closeSession = useTerminalStore((s) => s.closeSession);
  const setActiveSession = useTerminalStore((s) => s.setActiveSession);

  useEffect(() => {
    if (sessions.length === 0) createSession();
  }, [sessions.length, createSession]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-7 items-center border-b bg-muted">
        {sessions.map((sess) => (
          <button
            key={sess.id}
            onClick={() => setActiveSession(sess.id)}
            className={cn(
              'flex h-7 items-center gap-1 border-r px-3 text-xs hover:bg-accent',
              activeSessionId === sess.id && 'bg-background',
            )}
          >
            <span>{sess.name}</span>
            <span
              role="button"
              className="ml-1 rounded p-0.5 hover:bg-muted-foreground/20"
              onClick={(e) => {
                e.stopPropagation();
                closeSession(sess.id);
              }}
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="ml-1 h-6 w-6"
          onClick={() => createSession()}
          title="New terminal"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        {sessions.map((sess) => (
          <div
            key={sess.id}
            className={cn('h-full w-full', activeSessionId === sess.id ? 'block' : 'hidden')}
          >
            <XTerminal sessionId={sess.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
