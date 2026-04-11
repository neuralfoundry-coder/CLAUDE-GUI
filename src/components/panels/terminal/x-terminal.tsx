'use client';

import { useEffect, useRef } from 'react';
import { ReconnectingWebSocket } from '@/lib/websocket/reconnecting-ws';
import { useLayoutStore } from '@/stores/use-layout-store';

const HIGH_WATERMARK = 100 * 1024;
const LOW_WATERMARK = 10 * 1024;

interface XTerminalProps {
  sessionId: string;
}

export function XTerminal({ sessionId }: XTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fontSize = useLayoutStore((s) => s.fontSize);

  useEffect(() => {
    let disposed = false;
    let rws: ReconnectingWebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const boot = async () => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { WebglAddon } = await import('@xterm/addon-webgl').catch(() => ({ WebglAddon: null }));
      const { SearchAddon } = await import('@xterm/addon-search');
      const { WebLinksAddon } = await import('@xterm/addon-web-links');
      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        scrollback: 10000,
        fontFamily: 'JetBrains Mono, Menlo, monospace',
        fontSize,
        theme: { background: '#0a0a0a' },
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new SearchAddon());
      term.loadAddon(new WebLinksAddon());
      if (WebglAddon) {
        try {
          term.loadAddon(new WebglAddon());
        } catch {
          /* fall back to canvas renderer */
        }
      }
      term.open(containerRef.current);
      fitAddon.fit();

      let pendingBytes = 0;
      let paused = false;

      rws = new ReconnectingWebSocket({
        url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/terminal`,
        onOpen: (ws) => {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        },
        onMessage: (event) => {
          const data = event.data as string | ArrayBuffer;
          const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
          if (text.startsWith('{')) {
            try {
              const msg = JSON.parse(text);
              if (msg.type === 'exit') {
                term.write(`\r\n[process exited with code ${msg.code}]\r\n`);
                return;
              }
            } catch {
              /* not json */
            }
          }
          pendingBytes += text.length;
          term.write(text, () => {
            pendingBytes -= text.length;
            if (paused && pendingBytes < LOW_WATERMARK) {
              rws?.sendJson({ type: 'resume' });
              paused = false;
            }
          });
          if (!paused && pendingBytes > HIGH_WATERMARK) {
            rws?.sendJson({ type: 'pause' });
            paused = true;
          }
        },
      });

      term.onData((data) => {
        rws?.sendJson({ type: 'input', data });
      });

      resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
          rws?.sendJson({ type: 'resize', cols: term.cols, rows: term.rows });
        } catch {
          /* ignore */
        }
      });
      resizeObserver.observe(containerRef.current);
    };

    boot().catch(console.error);

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      rws?.close();
    };
  }, [sessionId, fontSize]);

  return <div ref={containerRef} className="h-full w-full bg-[#0a0a0a]" />;
}
