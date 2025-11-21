import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import { readDbStatus } from '@/lib/database/status';

// Routes that should be accessible before welcome flow completes
// NOTE: /welcome is NOT here - it's handled separately
const PUBLIC_ROUTES = [
  '/api/welcome-flow',
  '/api/db-status',
  '/api/settings',
  '/api/channels',
  '/api/health',
  '/api/version',
  '/_next',
  '/favicon.ico',
  '/manifest.json',
  '/assets',
];

/**
 * Check if welcome flow is complete
 */
async function isWelcomeComplete(): Promise<boolean> {
  try {
    // Check if database is ready first
    const dbStatus = readDbStatus();
    logger.error(`[PROXY-DEBUG] DB status: ${JSON.stringify(dbStatus)}`);
    if (!dbStatus.ready) {
      logger.error('[PROXY-DEBUG] Database not ready yet, returning false');
      return false; // Default to not complete if DB isn't ready
    }

    const db = await getDbInstance();
    logger.error('[PROXY-DEBUG] Got database instance');
    const result = await db.get<{ setting_value: string }>(
      'SELECT setting_value FROM app_settings WHERE setting_key = ?',
      ['welcome_flow_completed']
    );
    logger.error(`[PROXY-DEBUG] Query result: ${JSON.stringify(result)}`);
    const isComplete = result?.setting_value === 'true';
    logger.error(`[PROXY-DEBUG] Returning: ${isComplete}`);
    return isComplete;
  } catch (error) {
    logger.error('[PROXY-DEBUG] Error checking welcome status:', error);
    return false;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  logger.error(`[PROXY-DEBUG] === NEW REQUEST === Pathname: ${pathname}`);

  // Allow static/API public routes first
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    logger.error(`[PROXY-DEBUG] Public route, allowing: ${pathname}`);
    return NextResponse.next();
  }

  // Check welcome flow status
  const welcomeComplete = await isWelcomeComplete();
  logger.error(`[PROXY-DEBUG] Pathname: ${pathname}, Welcome complete: ${welcomeComplete}`);

  // Handle /welcome specifically
  if (pathname.startsWith('/welcome')) {
    if (welcomeComplete) {
      // Welcome is complete, redirect away from /welcome to home
      logger.error(`[PROXY-DEBUG] Redirecting ${pathname} -> / (welcome complete)`);
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    } 
      // Welcome not complete, allow access to /welcome
      logger.error(`[PROXY-DEBUG] Allowing ${pathname} (welcome not complete)`);
      return NextResponse.next();
    
  }

  // For all other routes, check if welcome is complete
  if (!welcomeComplete) {
    // Welcome not complete, redirect to /welcome
    logger.error(`[PROXY-DEBUG] Redirecting ${pathname} -> /welcome (not complete)`);
    const url = request.nextUrl.clone();
    url.pathname = '/welcome';
    return NextResponse.redirect(url);
  }

  // Welcome is complete, allow access to protected route
  logger.error(`[PROXY-DEBUG] Allowing request to: ${pathname}`);
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
