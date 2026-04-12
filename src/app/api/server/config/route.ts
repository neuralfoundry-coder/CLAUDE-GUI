import { NextRequest, NextResponse } from 'next/server';
import { loadServerConfig, saveServerConfig, generateToken } from '@/lib/server-config-wrapper';

export const dynamic = 'force-dynamic';

function isLocalhost(req: NextRequest): boolean {
  const host = req.headers.get('host') || '';
  return host.startsWith('127.0.0.1') || host.startsWith('localhost') || host.startsWith('[::1]');
}

export async function GET(req: NextRequest) {
  if (!isLocalhost(req)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const config = await loadServerConfig();
  return NextResponse.json({
    success: true,
    data: {
      remoteAccess: config.remoteAccess,
      remoteAccessToken: config.remoteAccessToken,
    },
  });
}

export async function PUT(req: NextRequest) {
  if (!isLocalhost(req)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const remoteAccess = typeof body.remoteAccess === 'boolean' ? body.remoteAccess : false;
    let remoteAccessToken: string | null = null;

    if (remoteAccess) {
      if (typeof body.remoteAccessToken === 'string' && body.remoteAccessToken.length > 0) {
        remoteAccessToken = body.remoteAccessToken;
      } else if (body.generateToken === true) {
        remoteAccessToken = await generateToken();
      }
    }

    const config = { remoteAccess, remoteAccessToken };
    await saveServerConfig(config);

    return NextResponse.json({
      success: true,
      data: { ...config },
    });
  } catch (err) {
    console.error('[api/server/config] error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
