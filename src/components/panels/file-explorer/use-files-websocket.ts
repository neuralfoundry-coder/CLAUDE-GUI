'use client';

import { useEffect, useRef } from 'react';
import { getFilesClient } from '@/lib/websocket/files-client';
import type { FileChangeMessage } from '@/types/websocket';

export function useFilesWebSocket(onChange: (event: FileChangeMessage) => void): void {
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    const client = getFilesClient();
    return client.subscribe((event) => handlerRef.current(event));
  }, []);
}
