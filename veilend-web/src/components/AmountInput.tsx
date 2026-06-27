'use client'

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ActivityActionType } from '@/lib/types/dashboard';
import {
  validateAmount,
  parseAmount,
  ValidationContext,
  ValidationResult,
} from '@/lib/validation/amount';

interface AmountInputProps {
  action: ActivityActionType;
  context: ValidationContext;
  assetSymbol: string;
  value: string;
  onChange: (value: string) => void;
  /** Called whenever validity changes so the parent can enable/disable submit */
  onValidityChange?: (result: ValidationResult) => void;
  disabled?: boolean;
}

/**
 * Controlled amount input with inline validation for protocol actions.
 * Blocks submission on errors and surfaces non-blocking risk/balance warnings.
 */
export function AmountInput({
  action,
  context,
  assetSymbol,
  value,
  onChange,
  onValidityChange,
  disabled,
}: AmountInputProps) {
  const [touched, setTouched] = React.useState(false);

  const result = React.useMemo(
    () => validateAmount(action, value, context),
    [action, value, context],
  );

  React.useEffect(() => {
    onValidityChange?.(result);
  }, [result, onValidityChange]);

  const showFeedback = touched && value.trim() !== '' && result.message;
  const isError = result.severity === 'error';

  const handleMax = () => {
    const max =
      action === 'REPAY' && context.outstandingDebt !== undefined
        ? Math.min(context.outstandingDebt, context.availableBalance)
        : context.availableBalance;
    onChange(String(max));
    setTouched(true);
  };

  const parsed = parseAmount(value);
  const usdPreview =
    parsed !== null && parsed > 0
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
          parsed * context.priceUsd,
        )
      : null;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          disabled={disabled}
          aria-invalid={showFeedback && isError ? true : undefined}
          aria-describedby={showFeedback ? `amount-feedback-${action}` : undefined}
          onChange={(e) => {
            onChange(e.target.value);
            if (!touched) setTouched(true);
          }}
          onBlur={() => setTouched(true)}
          className="pr-24 font-mono"
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleMax}
            disabled={disabled}
            className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400 hover:text-indigo-300 disabled:opacity-40"
          >
            Max
          </button>
          <span className="text-xs font-mono text-slate-500">{assetSymbol}</span>
        </div>
      </div>

      <div className="flex items-center justify-between min-h-[1rem]">
        {showFeedback ? (
          <span
            id={`amount-feedback-${action}`}
            role={isError ? 'alert' : 'status'}
            className={cn(
              'text-xs',
              isError ? 'text-destructive' : 'text-amber-400',
            )}
          >
            {result.message}
          </span>
        ) : (
          <span />
        )}
        {usdPreview && !isError && (
          <span className="text-xs font-mono text-slate-500">≈ {usdPreview}</span>
        )}
      </div>
    </div>
  );
}
