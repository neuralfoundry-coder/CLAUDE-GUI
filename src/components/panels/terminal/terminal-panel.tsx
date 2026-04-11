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
      <div className="flex h-7 items-center border-b bg-muted" aria-label="Terminal sessions">
        {sessions.map((sess) => {
          const isActive = activeSessionId === sess.id;
          return (
            <div
              key={sess.id}
              className={cn(
                'flex h-7 shrink-0 items-center gap-1 border-r px-3 text-xs',
                isActive && 'bg-background',
                !isActive && 'hover:bg-accent',
              )}
            >
              <button
                type="button"
                onClick={() => setActiveSession(sess.id)}
                className="bg-transparent"
                aria-label={`Activate ${sess.name}`}
              >
                {sess.name}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeSession(sess.id);
                }}
                aria-label={`Close ${sess.name}`}
                className="ml-1 rounded p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          );
        })}
        <Button
          variant="ghost"
          size="icon"
          className="ml-1 h-6 w-6"
          onClick={() => createSession()}
          title="New terminal"
          aria-label="New terminal"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
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
