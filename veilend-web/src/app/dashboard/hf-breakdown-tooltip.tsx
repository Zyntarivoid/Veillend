'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import type { HfBreakdownItem } from '@/lib/types/dashboard';

interface HfBreakdownTooltipProps {
  healthFactor: number;
  hfBreakdown: HfBreakdownItem[];
  hfWarning?: string;
}

const formatUsd = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);

const formatHf = (factor: number): string =>
  factor === Infinity ? '∞' : factor < 0 ? '—' : factor.toFixed(2);

export function HfBreakdownTooltip({ healthFactor, hfBreakdown, hfWarning }: HfBreakdownTooltipProps) {
  const isAtRisk = healthFactor < 1.1 && healthFactor !== Infinity && healthFactor >= 0;
  const badgeVariant = isAtRisk ? 'destructive' : 'secondary';
  const badgeClass = isAtRisk ? undefined : 'bg-emerald-500/10 text-emerald-400';

  const label = hfWarning ? hfWarning : `Health: ${formatHf(healthFactor)}`;

  if (hfBreakdown.length === 0 || hfWarning) {
    return (
      <Badge variant={badgeVariant} className={badgeClass} title={hfWarning}>
        {label}
      </Badge>
    );
  }

  const totalWeighted = hfBreakdown.reduce((s, r) => s + r.weightedUsd, 0);
  const tooltipLines = hfBreakdown.map(
    (r) => `${r.symbol}: ${formatUsd(r.depositedUsd)} × ${(r.minCollateralRatio * 100).toFixed(0)}% = ${formatUsd(r.weightedUsd)}`,
  );
  tooltipLines.push(`Effective collateral: ${formatUsd(totalWeighted)}`);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={badgeVariant} className={`${badgeClass ?? ''} cursor-help`}>
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-1 p-3 text-xs font-mono">
          <p className="font-semibold mb-1">Health Factor Breakdown</p>
          {hfBreakdown.map((r) => (
            <p key={r.symbol}>
              {r.symbol}: {formatUsd(r.depositedUsd)} × {(r.minCollateralRatio * 100).toFixed(0)}%
              {' = '}{formatUsd(r.weightedUsd)}
            </p>
          ))}
          <p className="border-t border-border pt-1 mt-1">
            Effective: {formatUsd(totalWeighted)}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
