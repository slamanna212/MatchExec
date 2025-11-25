import { redirect } from 'next/navigation';
import { getDbInstance } from './database-init';
import { logger } from '@/lib/logger/server';
import { readDbStatus } from '@/lib/database/status';

/**
 * Server-side utility to check if welcome flow is complete
 * @returns Promise<boolean> - true if welcome flow is complete
 */
export async function isWelcomeComplete(): Promise<boolean> {
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
    return false; // Default to not complete on error (safer)
  }
}

/**
 * Server-side guard for protected pages
 * Redirects to /welcome if setup is not complete
 * Call this at the top of any page that requires welcome flow completion
 */
export async function requireWelcomeComplete(): Promise<void> {
  const complete = await isWelcomeComplete();
  if (!complete) {
    redirect('/welcome');
  }
}

/**
 * Server-side guard for welcome pages
 * Redirects to / if setup is already complete
 * Call this at the top of welcome flow pages
 */
export async function requireWelcomeIncomplete(): Promise<void> {
  const complete = await isWelcomeComplete();
  if (complete) {
    redirect('/');
  }
}
