'use client';

import { useEffect, useRef } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { terminalManager } from '@/lib/terminal/terminal-manager';
import { terminalApi } from '@/lib/api-client';
import { useTerminalStore } from '@/stores/use-terminal-store';

interface XTerminalAttachProps {
  sessionId: string;
}

const PASTE_WARN_BYTES = 10 * 1024 * 1024;

export function XTerminalAttach({ sessionId }: XTerminalAttachProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const openSearchOverlay = useTerminalStore((s) => s.openSearchOverlay);
  const sessionCwd = useTerminalStore(
    (s) => s.sessions.find((sess) => sess.id === sessionId)?.cwd ?? null,
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    // Read initialCwd from the store so we pass it on the first ensureSession.
    const sess = useTerminalStore.getState().sessions.find((s) => s.id === sessionId);
    const initialCwd = sess?.cwd ?? undefined;

    const doAttach = () => {
      if (disposed) return;
      terminalManager.attach(sessionId, host);
    };

    if (terminalManager.hasSession(sessionId)) {
      doAttach();
    } else {
      terminalManager
        .ensureSession(sessionId, initialCwd ? { initialCwd } : undefined)
        .then(doAttach)
        .catch(() => {
          // ensureSession failed (e.g. xterm modules failed to load).
          // Transition the session out of "connecting" so the UI shows a
          // restart button instead of spinning forever.
          if (!disposed) {
            useTerminalStore.getState().updateSessionStatus(sessionId, 'closed', null);
          }
        });
    }
    return () => {
      disposed = true;
      terminalManager.detach(sessionId);
    };
  }, [sessionId]);

  const handleCopy = async () => {
    if (!terminalManager.hasSelection(sessionId)) return;
    const text = terminalManager.getSelection(sessionId);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore — clipboard may be unavailable */
    }
  };

  const handlePaste = async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }
    if (!text) return;
    if (text.length > PASTE_WARN_BYTES) {
      const ok = window.confirm(
        `Paste is ${Math.round(text.length / (1024 * 1024))} MB. Continue?`,
      );
      if (!ok) return;
    }
    terminalManager.paste(sessionId, text);
  };

  const handleSelectAll = () => terminalManager.selectAll(sessionId);
  const handleClear = () => terminalManager.clearBuffer(sessionId);
  const handleFind = () => openSearchOverlay();
  const setNativeNotice = useTerminalStore((s) => s.setNativeTerminalNotice);
  const handleOpenNative = async () => {
    try {
      const result = await terminalApi.openNative(sessionCwd ?? undefined);
      setNativeNotice({ type: 'success', message: `Opened in ${result.launcher}`, ts: Date.now() });
    } catch (err) {
      setNativeNotice({ type: 'error', message: `Could not open system terminal: ${(err as Error).message}`, ts: Date.now() });
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={hostRef}
          className="h-full w-full"
          style={{ background: 'var(--terminal-bg)' }}
          onClick={() => terminalManager.activate(sessionId)}
        />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={handleCopy}>Copy</ContextMenuItem>
        <ContextMenuItem onSelect={handlePaste}>Paste</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={handleSelectAll}>Select All</ContextMenuItem>
        <ContextMenuItem onSelect={handleClear}>Clear</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={handleFind}>Find…</ContextMenuItem>
        <ContextMenuItem onSelect={handleOpenNative}>
          Open in system terminal
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
