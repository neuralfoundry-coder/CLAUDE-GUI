'use client';

import { useEffect, useRef } from 'react';
import { terminalManager } from '@/lib/terminal/terminal-manager';

interface XTerminalAttachProps {
  sessionId: string;
}

export function XTerminalAttach({ sessionId }: XTerminalAttachProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    void terminalManager.ensureSession(sessionId).then(() => {
      if (disposed) return;
      terminalManager.attach(sessionId, host);
    });
    return () => {
      disposed = true;
      terminalManager.detach(sessionId);
    };
  }, [sessionId]);

  return (
    <div
      ref={hostRef}
      className="h-full w-full bg-[#0a0a0a]"
      onClick={() => terminalManager.activate(sessionId)}
    />
  );
}
