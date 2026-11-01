/**
 * Health alert rate limiting (`health_alerts_sent`): one row per alert type holding when it was last sent.
 * Used by the bot's HealthMonitor and the scheduler's bot-heartbeat check.
 */
import { eq } from 'drizzle-orm';
import { db as defaultDb, type Executor } from '../../lib/db';
import { healthAlertsSent } from '../../lib/db/schema';

/** When an alert of this type was last sent, or null when never. */
export async function getHealthAlertLastSent(alertType: string, ex: Executor = defaultDb): Promise<Date | null> {
  const [row] = await ex
    .select({ last_sent_at: healthAlertsSent.last_sent_at })
    .from(healthAlertsSent)
    .where(eq(healthAlertsSent.alert_type, alertType))
    .limit(1);
  return row?.last_sent_at ?? null;
}

/** Upsert the last-sent timestamp for an alert type (now). */
export async function markHealthAlertSent(alertType: string, ex: Executor = defaultDb): Promise<void> {
  const now = new Date();
  await ex
    .insert(healthAlertsSent)
    .values({ alert_type: alertType, last_sent_at: now })
    .onConflictDoUpdate({ target: healthAlertsSent.alert_type, set: { last_sent_at: now } });
}
