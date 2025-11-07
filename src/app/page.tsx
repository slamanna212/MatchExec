import { HomePage } from '@/components/home-page';
import { requireWelcomeComplete } from '@/lib/welcome-check';

export default async function Home() {
  // Server-side check: redirect to /welcome if not complete
  await requireWelcomeComplete();

  return <HomePage />;
}
