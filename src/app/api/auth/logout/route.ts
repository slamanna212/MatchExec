import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, isSecureRequest } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, '', {
    path: '/', httpOnly: true, sameSite: 'lax', secure: isSecureRequest(request), maxAge: 0,
  });
  return response;
}
