'use client';

import { useEffect, useRef } from 'react';
import { ReconnectingWebSocket } from '@/lib/websocket/reconnecting-ws';
import type { FileChangeMessage } from '@/types/websocket';

export function useFilesWebSocket(onChange: (event: FileChangeMessage) => void): void {
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    const ws = new ReconnectingWebSocket({
      url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/files`,
      onMessage: (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'change') handlerRef.current(msg as FileChangeMessage);
        } catch {
          /* ignore */
        }
      },
    });
    return () => ws.close();
  }, []);
}
