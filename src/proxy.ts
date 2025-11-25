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
    if (!dbStatus.ready) {
      return false; // Default to not complete if DB isn't ready
    }

    const db = await getDbInstance();
    const result = await db.get<{ setting_value: string }>(
      'SELECT setting_value FROM app_settings WHERE setting_key = ?',
      ['welcome_flow_completed']
    );
    return result?.setting_value === 'true';
  } catch (error) {
    logger.error('Error checking welcome status:', error);
    return false;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Allow static/API public routes first
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check welcome flow status
  const welcomeComplete = await isWelcomeComplete();

  // Handle /welcome specifically
  if (pathname.startsWith('/welcome')) {
    if (welcomeComplete) {
      // Welcome is complete, redirect away from /welcome to home
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    // Welcome not complete, allow access to /welcome
    return NextResponse.next();
  }

  // For all other routes, check if welcome is complete
  if (!welcomeComplete) {
    // Welcome not complete, redirect to /welcome
    const url = request.nextUrl.clone();
    url.pathname = '/welcome';
    return NextResponse.redirect(url);
  }

  // Welcome is complete, allow access to protected route
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
