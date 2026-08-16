import { toSafeNumber } from '@/lib/validation/coerce';

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const balanceFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 4,
});

export const UNAVAILABLE_AMOUNT_PLACEHOLDER = '—';
export const UNAVAILABLE_AMOUNT_WARNING = 'Amount unavailable';

type AmountDisplayProps = {
  value: number | null;
  format?: 'usd' | 'plain';
  className?: string;
  warning?: string;
};

export function AmountDisplay({
  value,
  format = 'usd',
  className,
  warning = UNAVAILABLE_AMOUNT_WARNING,
}: AmountDisplayProps) {
  const safeValue = toSafeNumber(value);

  if (safeValue === null) {
    return (
      <span
        data-testid="amount-slot"
        className={className}
        title={warning}
      >
        {UNAVAILABLE_AMOUNT_PLACEHOLDER}
      </span>
    );
  }

  const formatted = format === 'usd' ? usdFormatter.format(safeValue) : balanceFormatter.format(safeValue);

  return (
    <span data-testid="amount-slot" className={className}>
      {formatted}
    </span>
  );
}
