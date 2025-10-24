import { requireWelcomeIncomplete } from '@/lib/welcome-check';
import WelcomePageClient from './WelcomePageClient';

export default async function WelcomePage() {
  // Server-side check: redirect to / if already complete
  await requireWelcomeIncomplete();

  return <WelcomePageClient />;
}
