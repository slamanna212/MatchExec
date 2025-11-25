import { HomePage } from '@/components/home-page';

export default async function Home() {
  // Proxy handles welcome flow redirects - no need to check here
  return <HomePage />;
}
