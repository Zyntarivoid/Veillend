'use client';

import { useEffect } from 'react';
import { Container, Flex, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { Alert } from '@/components/Alert';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Dashboard failed to load:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background">
      <Container className="pb-16">
        <Section className="pt-20 pb-10">
          <Flex direction="col" gap="lg" className="max-w-2xl mx-auto text-center">
            <Alert variant="error" className="text-left">
              <h2 className="font-bold text-lg mb-2">Failed to load dashboard</h2>
              <p className="text-sm">
                We encountered an error while fetching your live portfolio and activity data. 
                Please try again or check your network connection.
              </p>
            </Alert>
            <div className="mt-4">
              <Button onClick={() => reset()} variant="primary">
                Try again
              </Button>
            </div>
          </Flex>
        </Section>
      </Container>
    </div>
  );
}
