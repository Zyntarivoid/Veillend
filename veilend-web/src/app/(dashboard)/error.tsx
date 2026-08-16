'use client';

import { useEffect } from 'react';
import ErrorFallback from '@/components/error/ErrorFallback';
import { captureException } from '@/lib/server/telemetry';

interface DashboardGroupErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardGroupError({ error, reset }: DashboardGroupErrorProps) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Dashboard Error"
      description="The dashboard could not be loaded. Please try again or return home."
    />
  );
}
