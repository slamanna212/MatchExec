import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, isAuthEnabled, verifySessionToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const enabled = isAuthEnabled();
  const authenticated = !enabled || (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value));
  return NextResponse.json({ enabled, authenticated });
}
