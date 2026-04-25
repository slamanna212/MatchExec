import { NextRequest, NextResponse } from 'next/server';
import { auth } from './auth';

export type AppRole = 'owner' | 'admin' | 'moderator' | 'viewer' | 'none';

export const ROLE_PRIORITY: Record<AppRole, number> = {
  owner:     4,
  admin:     3,
  moderator: 2,
  viewer:    1,
  none:      0,
};

export const ROLE_LABELS: Record<AppRole, string> = {
  owner:     'Owner',
  admin:     'Admin',
  moderator: 'Moderator',
  viewer:    'Viewer',
  none:      'No Access',
};

export const ROLE_COLORS: Record<AppRole, string> = {
  owner:     '#f7cc02',
  admin:     '#ef4444',
  moderator: '#3b82f6',
  viewer:    '#22c55e',
  none:      '#6c757d',
};

export const ALL_ROLES: AppRole[] = ['owner', 'admin', 'moderator', 'viewer'];

export function hasPermission(userRole: AppRole, requiredRole: AppRole): boolean {
  return ROLE_PRIORITY[userRole] >= ROLE_PRIORITY[requiredRole];
}

export type AuthedUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  appRole: AppRole;
};

/**
 * Use in API route handlers to enforce a minimum permission level.
 * Returns { user } on success or a NextResponse (401/403) on failure.
 */
export async function requirePermission(
  req: NextRequest,
  minRole: AppRole,
): Promise<{ user: AuthedUser } | NextResponse> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRole = ((session.user as any).appRole as AppRole) || 'none';
  if (!hasPermission(userRole, minRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
      appRole: userRole,
    },
  };
}
