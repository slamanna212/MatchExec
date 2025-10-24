import { requireWelcomeIncomplete } from '@/lib/welcome-check';
import ChannelsSetupClient from './ChannelsSetupClient';

export default async function ChannelsSetupPage() {
  // Server-side check: redirect to / if already complete
  await requireWelcomeIncomplete();

  return <ChannelsSetupClient />;
}
