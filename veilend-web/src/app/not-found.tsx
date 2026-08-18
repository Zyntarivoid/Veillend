import Link from 'next/link';
import { Home, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: '404 - Page Not Found',
  description: 'The page you are looking for could not be found.',
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center text-foreground">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="h-8 w-8" aria-hidden="true" />
      </div>
      <h1 className="mb-2 text-3xl font-bold">Page Not Found</h1>
      <p className="mb-6 max-w-md text-sm text-muted-foreground">
        The page you are looking for doesn&apos;t exist, may have been moved, or is temporarily unavailable.
      </p>
      <Button asChild className="gap-2">
        <Link href="/">
          <Home className="h-4 w-4" aria-hidden="true" />
          Back to Home
        </Link>
      </Button>
    </main>
  );
}
