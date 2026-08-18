'use client';

import ErrorFallback from '@/components/error/ErrorFallback';
import './globals.css';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body className="bg-background">
        <ErrorFallback
          error={error}
          reset={reset}
          title="Something went wrong"
          description="A critical error occurred while rendering the application. You can retry or return home."
        />
      </body>
    </html>
  );
}
