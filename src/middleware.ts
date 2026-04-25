import { NextRequest, NextResponse } from 'next/server';

// Paths that don't require authentication
const PUBLIC_PREFIXES = [
  '/login',
  '/welcome',
  '/api/auth',
  '/api/health',
  '/api/db-status',
  '/api/version',
  '/api/welcome-flow',
  '/api/feed',
  '/_next',
];

const SESSION_COOKIE = 'better-auth.session_token';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and static assets
  if (
    PUBLIC_PREFIXES.some(p => pathname.startsWith(p)) ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const session = req.cookies.get(SESSION_COOKIE);
  if (!session?.value) {
    const loginUrl = new URL('/login', req.url);
    // Only set redirect param for page navigations, not API calls
    if (!pathname.startsWith('/api/')) {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo\\.svg).*)'],
};
