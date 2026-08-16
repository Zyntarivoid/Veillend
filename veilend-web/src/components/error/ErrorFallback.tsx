'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bug, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const REPORT_ISSUE_URL =
  'https://github.com/Zyntarivoid/Veillend/issues/new?assignees=&labels=bug&template=bug_report.yml';

interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void | Promise<void>;
  title?: string;
  description?: string;
  showHome?: boolean;
  showReport?: boolean;
}

function captureError(error: Error & { digest?: string }): void {
  const capture = (globalThis as { Sentry?: { captureException?: (err: unknown) => void } }).Sentry;
  if (typeof capture?.captureException === 'function') {
    capture.captureException(error);
  }
  console.error('Unhandled application error:', error);
}

export default function ErrorFallback({
  error,
  reset,
  title = 'Something went wrong',
  description = 'An unexpected error occurred while rendering this page.',
  showHome = true,
  showReport = true,
}: ErrorFallbackProps) {
  const [isResetting, setIsResetting] = useState(false);
  const resettingRef = useRef(false);

  useEffect(() => {
    captureError(error);
  }, [error]);

  const handleReset = async () => {
    // The ref guards against duplicate submissions even when two clicks land
    // in the same tick before React commits the state update.
    if (resettingRef.current) return;
    resettingRef.current = true;
    setIsResetting(true);
    try {
      await reset();
    } finally {
      resettingRef.current = false;
      setIsResetting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center text-foreground">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-8 w-8" aria-hidden="true" />
      </div>
      <h1 className="mb-2 text-3xl font-bold">{title}</h1>
      <p className="mb-4 max-w-md text-sm text-muted-foreground">{description}</p>
      {error.digest && (
        <p className="mb-6 font-mono text-xs text-muted-foreground">Error ID: {error.digest}</p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={handleReset} aria-busy={isResetting} aria-label="Retry loading" className="gap-2">
          <RefreshCw className={isResetting ? 'animate-spin' : ''} aria-hidden="true" />
          Try Again
        </Button>
        {showHome && (
          <Button variant="outline" onClick={() => (window.location.href = '/')} className="gap-2">
            <Home className="h-4 w-4" aria-hidden="true" />
            Back to Home
          </Button>
        )}
        {showReport && (
          <Button variant="ghost" onClick={() => window.open(REPORT_ISSUE_URL, '_blank')} className="gap-2">
            <Bug className="h-4 w-4" aria-hidden="true" />
            Report Issue
          </Button>
        )}
      </div>
    </main>
  );
}
