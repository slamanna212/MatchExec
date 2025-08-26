'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface WelcomeFlowWrapperProps {
  children: React.ReactNode;
}

export default function WelcomeFlowWrapper({ children }: WelcomeFlowWrapperProps) {
  const [isCheckingFirstRun, setIsCheckingFirstRun] = useState(true);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    async function checkFirstRun() {
      try {
        // Always show children for welcome pages
        if (pathname.startsWith('/welcome')) {
          setIsCheckingFirstRun(false);
          return;
        }

        const response = await fetch('/api/welcome-flow');
        if (response.ok) {
          const data = await response.json();
          if (data.isFirstRun) {
            setIsFirstRun(true);
            router.push('/welcome');
          }
        }
      } catch (error) {
        console.error('Error checking first run status:', error);
        // On error, just show the app
      } finally {
        setIsCheckingFirstRun(false);
      }
    }

    checkFirstRun();
  }, [pathname, router]);

  // Always render children, but show them after the check is done
  // or if we're on welcome pages
  if (isCheckingFirstRun && !pathname.startsWith('/welcome')) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '14px',
        color: '#666'
      }}>
        Loading...
      </div>
    );
  }

  return <>{children}</>;
}