import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function isLocalhost(req: NextRequest): boolean {
  const host = req.headers.get('host') || '';
  return host.startsWith('127.0.0.1') || host.startsWith('localhost') || host.startsWith('[::1]');
}

export async function POST(req: NextRequest) {
  if (!isLocalhost(req)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const g = globalThis as Record<string, unknown>;
  const restartFn = g.__restartServer as (() => Promise<void>) | undefined;

  if (typeof restartFn !== 'function') {
    return NextResponse.json(
      { success: false, error: 'Restart not available (not running via server.js)' },
      { status: 503 },
    );
  }

  // Trigger restart asynchronously so we can respond before the server closes
  setTimeout(() => {
    restartFn().catch((err) => {
      console.error('[api/server/restart] restart error', err);
    });
  }, 100);

  return NextResponse.json({
    success: true,
    data: { message: 'Server restart initiated' },
  });
}
