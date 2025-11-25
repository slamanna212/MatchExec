import { requireWelcomeIncomplete } from '@/lib/welcome-check';
import DiscordSetupClient from './DiscordSetupClient';

export default async function DiscordSetupPage() {
  // Server-side check: redirect to / if already complete
  await requireWelcomeIncomplete();

  return <DiscordSetupClient />;
}
