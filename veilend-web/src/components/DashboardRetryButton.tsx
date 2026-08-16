'use client';

import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type DashboardRetryButtonProps = {
  label?: string;
};

export function DashboardRetryButton({ label = 'Retry' }: DashboardRetryButtonProps) {
  const router = useRouter();

  return (
    <Button
      type="button"
      data-testid="dashboard-retry"
      className="flex items-center gap-2"
      onClick={() => {
        router.refresh();
      }}
    >
      <RefreshCw className="h-4 w-4" />
      {label}
    </Button>
  );
}
