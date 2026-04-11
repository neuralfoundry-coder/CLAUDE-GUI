'use client';

import { ReconnectingWebSocket } from './reconnecting-ws';
import { useConnectionStore } from '@/stores/use-connection-store';
import type { FileChangeMessage, ProjectChangedMessage } from '@/types/websocket';

type Listener = (event: FileChangeMessage) => void;
type ProjectChangeListener = (event: ProjectChangedMessage) => void;

let singleton: FilesClient | null = null;

class FilesClient {
  private ws: ReconnectingWebSocket | null = null;
  private listeners = new Set<Listener>();
  private projectListeners = new Set<ProjectChangeListener>();

  start(): void {
    if (this.ws) return;
    this.ws = new ReconnectingWebSocket({
      url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/files`,
      onOpen: () => useConnectionStore.getState().setStatus('files', 'open'),
      onClose: () => useConnectionStore.getState().setStatus('files', 'closed'),
      onMessage: (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'change') {
            for (const l of this.listeners) l(msg as FileChangeMessage);
          } else if (msg.type === 'project-changed') {
            for (const l of this.projectListeners) l(msg as ProjectChangedMessage);
          }
        } catch {
          /* ignore */
        }
      },
    });
  }

  subscribe(listener: Listener): () => void {
    this.start();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeProjectChange(listener: ProjectChangeListener): () => void {
    this.start();
    this.projectListeners.add(listener);
    return () => {
      this.projectListeners.delete(listener);
    };
  }
}

export function getFilesClient(): FilesClient {
  if (!singleton) singleton = new FilesClient();
  return singleton;
}
