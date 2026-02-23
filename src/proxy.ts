import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';

const WELCOME_COOKIE = 'welcome_flow_completed';
const WELCOME_PATH = '/welcome';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isWelcomePath = pathname === WELCOME_PATH || pathname.startsWith(`${WELCOME_PATH}/`);

  const cookie = request.cookies.get(WELCOME_COOKIE)?.value;
  let isComplete: boolean;
  let shouldSetCookie = false;

  if (cookie === 'true' || cookie === 'false') {
    isComplete = cookie === 'true';
  } else {
    // No cookie — check DB via internal API
    try {
      const res = await fetch(new URL('/api/welcome-flow', request.url), { cache: 'no-store' });
      const data = await res.json();
      if (!data.dbReady) return NextResponse.next(); // DB still initializing
      isComplete = data.completed;
      shouldSetCookie = true;
    } catch {
      return NextResponse.next(); // On error, allow through
    }
  }

  let response: NextResponse;
  if (isComplete && isWelcomePath) {
    response = NextResponse.redirect(new URL('/', request.url));
  } else if (!isComplete && !isWelcomePath) {
    response = NextResponse.redirect(new URL(WELCOME_PATH, request.url));
  } else {
    response = NextResponse.next();
  }

  if (shouldSetCookie) {
    response.cookies.set(WELCOME_COOKIE, isComplete ? 'true' : 'false', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|manifest\\.json).*)'],
};
