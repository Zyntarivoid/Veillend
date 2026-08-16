'use client';

import { useEffect, useRef, useState } from 'react';
import { Container, Flex, Section } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorProps) {
  const [isResetting, setIsResetting] = useState(false);
  const resettingRef = useRef(false);

  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Dashboard Error:', error);
  }, [error]);

  const isAuthError = error.message?.includes('address') || error.message?.includes('wallet');
  const isNetworkError = error.message?.includes('fetch') || error.message?.includes('network');

  const handleReset = async () => {
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
    <div className="min-h-screen bg-background">
      <Container className="pb-16">
        <Section className="pt-20 pb-10">
          <Flex direction="col" align="center" gap="lg" className="max-w-2xl mx-auto">
            <Alert variant="destructive" className="w-full">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-lg font-semibold">
                {isAuthError ? 'Wallet Connection Error' : 
                 isNetworkError ? 'Network Error' : 
                 'Dashboard Error'}
              </AlertTitle>
              <AlertDescription className="mt-2">
                <p className="text-sm">
                  {isAuthError 
                    ? 'Unable to load dashboard data. Please ensure your wallet is properly connected and try again.'
                    : isNetworkError
                    ? 'Network connection issue. Please check your internet connection and try again.'
                    : 'An unexpected error occurred while loading the dashboard.'
                  }
                </p>
                {error.digest && (
                  <p className="text-xs mt-2 text-muted-foreground">
                    Error ID: {error.digest}
                  </p>
                )}
              </AlertDescription>
            </Alert>

            <div className="flex gap-4">
              <Button
                onClick={handleReset}
                aria-busy={isResetting}
                aria-label="Retry loading dashboard"
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isResetting ? 'animate-spin' : ''}`} aria-hidden="true" />
                Try Again
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.href = '/'}
              >
                Return Home
              </Button>
            </div>

            <div className="text-sm text-muted-foreground mt-4">
              <p>If the issue persists, please:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Verify your wallet is connected</li>
                <li>Check the backend API is running</li>
                <li>Ensure you have a stable network connection</li>
              </ul>
            </div>
          </Flex>
        </Section>
      </Container>
    </div>
  );
}