'use client';

import { useEffect, useState } from 'react';
import { DatabaseLoadingScreen } from './DatabaseLoadingScreen';
import { logger } from '@/lib/logger/client';

interface DatabaseStatus {
  ready: boolean;
  progress: string;
  timestamp: number;
}

interface DatabaseStatusWrapperProps {
  children: React.ReactNode;
}

export function DatabaseStatusWrapper({ children }: DatabaseStatusWrapperProps) {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/db-status');
        if (response.ok) {
          const data: DatabaseStatus = await response.json();
          setStatus(data);

          if (data.ready) {
            setIsChecking(false);
          } else {
            // Keep checking if not ready
            setTimeout(checkStatus, 1500);
          }
        }
      } catch (error) {
        logger.error('Failed to check database status:', error);
        // On error, assume ready and show the app
        setIsChecking(false);
      }
    };

    checkStatus();
  }, []);

  if (isChecking && status && !status.ready) {
    return <DatabaseLoadingScreen />;
  }

  return <>{children}</>;
}