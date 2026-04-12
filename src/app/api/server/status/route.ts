import { NextRequest, NextResponse } from 'next/server';
import { networkInterfaces } from 'node:os';
import { loadServerConfig } from '@/lib/server-config-wrapper';

export const dynamic = 'force-dynamic';

function isLocalhost(req: NextRequest): boolean {
  // In Next.js API routes, x-forwarded-for may be set by the server
  // For safety, we also check the host header
  const host = req.headers.get('host') || '';
  return host.startsWith('127.0.0.1') || host.startsWith('localhost') || host.startsWith('[::1]');
}

function getLocalIPs(): string[] {
  const interfaces = networkInterfaces();
  const ips: string[] = [];
  for (const [, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (!addr.internal && addr.family === 'IPv4') {
        ips.push(addr.address);
      }
    }
  }
  return ips;
}

export async function GET(req: NextRequest) {
  if (!isLocalhost(req)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const config = await loadServerConfig();

  // Read current server state from globals set by server.js
  const g = globalThis as Record<string, unknown>;
  const hostname = (g.__serverHostname as string) || '127.0.0.1';
  const port = (g.__serverPort as number) || 3000;

  return NextResponse.json({
    success: true,
    data: {
      hostname,
      port,
      remoteAccess: config.remoteAccess,
      hasToken: !!config.remoteAccessToken,
      localIPs: getLocalIPs(),
      uptime: process.uptime(),
    },
  });
}
