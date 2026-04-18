'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, X, RotateCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTerminalStore, type TerminalSession, type NativeTerminalNotice } from '@/stores/use-terminal-store';
import { useProjectStore } from '@/stores/use-project-store';
import { terminalApi } from '@/lib/api-client';
import { usePanelFocus } from '@/hooks/use-panel-focus';
import { useKeyboardShortcut, isFocusInsideTerminal } from '@/hooks/use-keyboard-shortcut';
import { PanelZoomControls } from '@/components/panels/panel-zoom-controls';
import { XTerminalAttach } from './x-terminal';
import { TerminalSearchOverlay } from './terminal-search-overlay';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableTabItem } from '@/components/dnd/sortable-tab-item';
import type { DragData } from '@/components/dnd/dnd-provider';

async function openInSystemTerminal(
  cwd: string | null | undefined,
  notify: (notice: NativeTerminalNotice | null) => void,
): Promise<void> {
  try {
    const result = await terminalApi.openNative(cwd ?? undefined);
    notify({ type: 'success', message: `Opened in ${result.launcher}`, ts: Date.now() });
  } catch (err) {
    notify({ type: 'error', message: `Could not open system terminal: ${(err as Error).message}`, ts: Date.now() });
  }
}

function basename(path: string | null): string | null {
  if (!path) return null;
  const trimmed = path.replace(/\/+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const base = i >= 0 ? trimmed.slice(i + 1) : trimmed;
  if (!base) return '/';
  if (base.length > 20) return base.slice(0, 17) + '…';
  return base;
}

interface TerminalTabProps {
  session: TerminalSession;
  isActive: boolean;
  onActivate: () => void;
  onClose: () => void;
  onRestart: () => void;
  onRename: (name: string) => void;
}

function TerminalTab({
  session,
  isActive,
  onActivate,
  onClose,
  onRestart,
  onRename,
}: TerminalTabProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== session.name) onRename(next);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(session.name);
    setEditing(false);
  };

  const isExited = session.status === 'exited';
  const isClosed = session.status === 'closed';
  const canRestart = isExited || isClosed;
  const cwdLabel = basename(session.cwd);

  return (
    <div
      className={cn(
        'flex h-7 shrink-0 items-center gap-1 border-r px-3 text-xs',
        isActive && 'bg-background',
        !isActive && 'hover:bg-accent',
      )}
      title={session.cwd ?? undefined}
    >
      <button
        type="button"
        onClick={onActivate}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(session.name);
          setEditing(true);
        }}
        className="flex items-center gap-1 bg-transparent"
        aria-label={`Activate ${session.name}`}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            session.status === 'open' && 'bg-emerald-500',
            session.status === 'connecting' && 'bg-amber-500',
            isClosed && 'bg-zinc-500',
            isExited && 'bg-red-500',
          )}
          aria-hidden="true"
        />
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            className="h-5 w-24 rounded border bg-background px-1 text-xs outline-none focus:ring-1"
            aria-label="Rename session"
          />
        ) : (
          <span
            className={cn(
              isExited && 'line-through opacity-70',
              !isActive && session.unread && 'font-semibold text-foreground',
            )}
          >
            {session.name}
            {cwdLabel && (
              <span className="ml-1 text-muted-foreground">· {cwdLabel}</span>
            )}
            {!isActive && session.unread && (
              <span
                className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-400"
                aria-label="unread output"
              />
            )}
          </span>
        )}
      </button>
      {canRestart && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRestart();
          }}
          aria-label={`Restart ${session.name}`}
          title="Restart shell"
          className="ml-1 rounded p-0.5 hover:bg-muted-foreground/20"
        >
          <RotateCw className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={`Close ${session.name}`}
        className="ml-1 rounded p-0.5 hover:bg-muted-foreground/20"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}

function ConnectingOverlay({ sessionId }: { sessionId: string }) {
  const [showCancel, setShowCancel] = useState(false);
  const updateSessionStatus = useTerminalStore((s) => s.updateSessionStatus);

  useEffect(() => {
    const timer = setTimeout(() => setShowCancel(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-12">
      <div className="flex items-center gap-2 rounded-md border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
        <span className="text-muted-foreground">
          Connecting to shell&hellip;
        </span>
        <span className="text-muted-foreground/60">
          Keystrokes will be delivered when connected
        </span>
        {showCancel && (
          <Button
            variant="ghost"
            size="sm"
            className="pointer-events-auto h-5 px-2 text-xs text-muted-foreground"
            onClick={() => updateSessionStatus(sessionId, 'closed', null)}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

interface TerminalPanelProps {
  leafId?: string;
}

export function TerminalPanel({ leafId: _leafId }: TerminalPanelProps) {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const primarySessionId = useTerminalStore((s) => s.primarySessionId);
  const secondarySessionId = useTerminalStore((s) => s.secondarySessionId);
  const splitEnabled = useTerminalStore((s) => s.splitEnabled);
  const activePaneIndex = useTerminalStore((s) => s.activePaneIndex);
  const createSession = useTerminalStore((s) => s.createSession);
  const closeSession = useTerminalStore((s) => s.closeSession);
  const restartSession = useTerminalStore((s) => s.restartSession);
  const setActiveSession = useTerminalStore((s) => s.setActiveSession);
  const renameSession = useTerminalStore((s) => s.renameSession);
  const focusPane = useTerminalStore((s) => s.focusPane);
  const searchOpen = useTerminalStore((s) => s.searchOverlayOpen);
  const openSearchOverlay = useTerminalStore((s) => s.openSearchOverlay);
  const closeSearchOverlay = useTerminalStore((s) => s.closeSearchOverlay);
  const nativeNotice = useTerminalStore((s) => s.nativeTerminalNotice);
  const setNativeNotice = useTerminalStore((s) => s.setNativeTerminalNotice);
  const activeRoot = useProjectStore((s) => s.activeRoot);
  const panelFocus = usePanelFocus('terminal');

  const [dismissedRoot, setDismissedRoot] = useState<string | null>(null);

  useEffect(() => {
    if (sessions.length === 0) createSession(activeRoot ? { initialCwd: activeRoot } : undefined);
  }, [sessions.length, createSession]);

  // Cmd/Ctrl+F opens the terminal search overlay when focus is inside the
  // terminal. We gate with `when` so the same binding doesn't fight with the
  // browser's default find when focus is elsewhere (e.g. in the editor).
  useKeyboardShortcut([
    {
      key: 'f',
      meta: true,
      ctrl: true,
      when: isFocusInsideTerminal,
      handler: () => openSearchOverlay(),
    },
  ]);

  // When the active project root changes, reset the dismiss state so the
  // banner can reappear for the new root if a mismatch still exists.
  useEffect(() => {
    setDismissedRoot(null);
  }, [activeRoot]);

  // Auto-dismiss native terminal notice after a timeout.
  useEffect(() => {
    if (!nativeNotice) return;
    const delay = nativeNotice.type === 'success' ? 3000 : 8000;
    const timer = setTimeout(() => setNativeNotice(null), delay);
    return () => clearTimeout(timer);
  }, [nativeNotice, setNativeNotice]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const isRestartable =
    activeSession?.status === 'exited' || activeSession?.status === 'closed';

  const bannerVisible =
    !!activeRoot &&
    dismissedRoot !== activeRoot &&
    sessions.some((s) => s.cwd && s.cwd !== activeRoot);

  return (
    <div
      className="flex h-full flex-col panel-container bg-background"
      data-terminal-panel="true"
      data-panel-id="terminal"
      onMouseDown={panelFocus.onMouseDown}
      onFocus={panelFocus.onFocus}
    >
      {bannerVisible && activeRoot && (
        <div
          className="flex items-center justify-between gap-2 border-b bg-amber-500/10 px-3 py-1 text-xs"
          role="status"
        >
          <span className="truncate text-muted-foreground">
            Active project changed to <code className="font-mono">{activeRoot}</code>. Existing
            tabs still in their original directory.
          </span>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => createSession(activeRoot ? { initialCwd: activeRoot } : undefined)}
            >
              Open new tab here
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setDismissedRoot(activeRoot)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}
      {nativeNotice && (
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2 border-b px-3 py-1 text-xs',
            nativeNotice.type === 'success' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
            nativeNotice.type === 'error' && 'bg-red-500/10 text-red-700 dark:text-red-400',
          )}
          onClick={() => setNativeNotice(null)}
        >
          <span className="truncate">{nativeNotice.message}</span>
          <X className="ml-auto h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      )}
      <div className="flex h-7 items-center border-b glass-surface glass-highlight relative" aria-label="Terminal sessions">
        <SortableContext items={sessions.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
          {sessions.map((sess) => {
            const dragData: DragData = {
              tabId: sess.id,
              sourceType: 'terminal',
            };
            return (
              <SortableTabItem key={sess.id} id={sess.id} dragData={dragData}>
                <TerminalTab
                  session={sess}
                  isActive={activeSessionId === sess.id}
                  onActivate={() => setActiveSession(sess.id)}
                  onClose={() => closeSession(sess.id)}
                  onRestart={() => restartSession(sess.id)}
                  onRename={(name) => renameSession(sess.id, name)}
                />
              </SortableTabItem>
            );
          })}
        </SortableContext>
        <Button
          variant="ghost"
          size="icon"
          className="ml-1 h-6 w-6"
          onClick={() => createSession(activeRoot ? { initialCwd: activeRoot } : undefined)}
          title="New terminal"
          aria-label="New terminal"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => openInSystemTerminal(activeSession?.cwd, setNativeNotice)}
          title="Open in system terminal (⇧⌘O)"
          aria-label="Open in system terminal"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Button>
        <div className="ml-auto" />
        <PanelZoomControls panelId="terminal" />
      </div>
      <div className="relative flex-1 overflow-hidden">
        {splitEnabled ? (
          <div className="flex h-full w-full">
            <div
              className={cn(
                'flex-1 min-w-0 overflow-hidden',
                activePaneIndex === 0 && 'ring-1 ring-inset ring-sky-500/60',
              )}
              onMouseDown={() => focusPane(0)}
            >
              {primarySessionId && (
                <XTerminalAttach key={`pri-${primarySessionId}`} sessionId={primarySessionId} />
              )}
            </div>
            <div className="w-px bg-border" aria-hidden="true" />
            <div
              className={cn(
                'flex-1 min-w-0 overflow-hidden',
                activePaneIndex === 1 && 'ring-1 ring-inset ring-sky-500/60',
              )}
              onMouseDown={() => focusPane(1)}
            >
              {secondarySessionId && (
                <XTerminalAttach key={`sec-${secondarySessionId}`} sessionId={secondarySessionId} />
              )}
            </div>
          </div>
        ) : (
          activeSessionId && <XTerminalAttach key={activeSessionId} sessionId={activeSessionId} />
        )}
        {searchOpen && activeSessionId && (
          <TerminalSearchOverlay sessionId={activeSessionId} onClose={closeSearchOverlay} />
        )}
        {activeSession?.status === 'connecting' && (
          <ConnectingOverlay sessionId={activeSession.id} />
        )}
        {isRestartable && activeSession && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-12">
            <div className="pointer-events-auto flex items-center gap-2 rounded-md border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
              <span className="text-muted-foreground">
                {activeSession.status === 'exited'
                  ? `Shell exited${
                      activeSession.exitCode != null ? ` (code ${activeSession.exitCode})` : ''
                    }`
                  : 'Connection to PTY lost'}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => restartSession(activeSession.id)}
              >
                <RotateCw className="mr-1 h-3 w-3" aria-hidden="true" />
                Restart
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
