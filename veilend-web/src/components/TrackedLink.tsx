'use client';

import React from 'react';
import { buttonClassName } from '@/components/Button';
import { trackCampaignEvent } from '@/lib/campaignAnalytics';

type TrackedLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  ctaId: string;
  ctaLabel: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
};

export function TrackedLink({
  ctaId,
  ctaLabel,
  href,
  onClick,
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  children,
  ...props
}: TrackedLinkProps) {
  return (
    <a
      href={href}
      className={buttonClassName({ variant, size, fullWidth, className })}
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
