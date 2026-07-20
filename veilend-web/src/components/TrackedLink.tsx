'use client';

import React from 'react';
import { type VariantProps } from 'class-variance-authority';
import { buttonVariants } from '@/components/ui/button';
import { trackCampaignEvent } from '@/lib/campaignAnalytics';
import { cn } from '@/lib/utils';

type TrackedLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  ctaId: string;
  ctaLabel: string;
  variant?: VariantProps<typeof buttonVariants>['variant'];
  size?: VariantProps<typeof buttonVariants>['size'];
  fullWidth?: boolean;
};

export function TrackedLink({
  ctaId,
  ctaLabel,
  href,
  onClick,
  className,
  variant = 'default',
  size = 'default',
  fullWidth = false,
  children,
  ...props
}: TrackedLinkProps) {
  return (
    <a
      href={href}
      className={cn(buttonVariants({ variant, size }), fullWidth && 'w-full', className)}
      onClick={(event) => {
        trackCampaignEvent('campaign_cta_click', {
          ctaId,
          ctaLabel,
          targetUrl: typeof href === 'string' ? href : undefined,
        });
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  );
}
