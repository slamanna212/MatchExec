import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import { readDbStatus } from '@/lib/database/status';

// Routes that should be accessible before welcome flow completes
const PUBLIC_ROUTES = [
  '/welcome',
  '/api/welcome-flow',
  '/api/db-status',
  '/api/settings',
  '/api/channels',
  '/_next',
  '/favicon.ico',
  '/manifest.json',
  '/assets',
];

// Routes that should redirect to home if welcome is complete
const WELCOME_ROUTES = ['/welcome'];

/**
 * Check if welcome flow is complete
 */
async function isWelcomeComplete(): Promise<boolean> {
  try {
    // Check if database is ready first
    const dbStatus = readDbStatus();
    if (!dbStatus.ready) {
      logger.debug('Proxy: Database not ready yet, skipping welcome check');
      return false; // Default to not complete if DB isn't ready
    }

    const db = await getDbInstance();
    const result = await db.get<{ setting_value: string }>(
      'SELECT setting_value FROM app_settings WHERE setting_key = ?',
      ['welcome_flow_completed']
    );
    return result?.setting_value === 'true';
  } catch (error) {
    logger.error('Proxy: Error checking welcome status:', error);
    return false;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Allow public routes (API, static assets, etc.)
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check welcome flow status
  const welcomeComplete = await isWelcomeComplete();

  // If welcome is NOT complete and trying to access protected route
  if (!welcomeComplete && !pathname.startsWith('/welcome')) {
    const url = request.nextUrl.clone();
    url.pathname = '/welcome';
    return NextResponse.redirect(url);
  }

  // If welcome IS complete and trying to access welcome route
  if (welcomeComplete && WELCOME_ROUTES.some(route => pathname.startsWith(route))) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Configure which routes proxy runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
