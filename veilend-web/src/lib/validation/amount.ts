import { ActivityActionType } from '../types/dashboard';

export interface ValidationContext {
  /** User's available balance of the asset, in human units (not raw) */
  availableBalance: number;
  /** For BORROW: remaining borrow capacity in USD; for REPAY: outstanding debt */
  borrowLimitUsd?: number;
  /** Current outstanding debt for the asset, in human units */
  outstandingDebt?: number;
  /** Price of the asset in USD */
  priceUsd: number;
  /** Decimals of the asset (Stellar standard is 7) */
  decimals?: number;
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationResult {
  valid: boolean;
  severity?: ValidationSeverity;
  /** Short, mobile-friendly message */
  message?: string;
}

const OK: ValidationResult = { valid: true };

/**
 * Parse a raw user input string into a number, rejecting anything that is not a
 * clean positive decimal. Returns null when unparseable.
 */
export function parseAmount(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  // Only digits and at most one decimal point
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return value;
}

/**
 * Enforce that an amount does not exceed the asset's decimal precision.
 * Stellar assets use 7 decimals — more than that cannot be represented on-chain.
 */
export function exceedsPrecision(value: number, decimals = 7): boolean {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  return Math.abs(scaled - Math.round(scaled)) > 1e-6;
}

/**
 * Validate a deposit/borrow/repay/withdraw amount against the user's context.
 * Returns the first blocking error, or a non-blocking warning, or OK.
 */
export function validateAmount(
  action: ActivityActionType,
  input: string,
  ctx: ValidationContext,
): ValidationResult {
  const value = parseAmount(input);

  if (value === null) {
    return { valid: false, severity: 'error', message: 'Enter a valid amount.' };
  }
  if (value <= 0) {
    return { valid: false, severity: 'error', message: 'Amount must be greater than zero.' };
  }
  if (exceedsPrecision(value, ctx.decimals ?? 7)) {
    return {
      valid: false,
      severity: 'error',
      message: `Max ${ctx.decimals ?? 7} decimal places.`,
    };
  }

  switch (action) {
    case 'DEPOSIT':
    case 'WITHDRAW': {
      if (value > ctx.availableBalance) {
        return {
          valid: false,
          severity: 'error',
          message: `Exceeds your balance of ${formatShort(ctx.availableBalance)}.`,
        };
      }
      // Warn if using the entire balance (no buffer left for fees)
      if (value === ctx.availableBalance) {
        return {
          valid: true,
          severity: 'warning',
          message: 'Using your full balance leaves nothing for network fees.',
        };
      }
      return OK;
    }

    case 'BORROW': {
      const usd = value * ctx.priceUsd;
      if (ctx.borrowLimitUsd !== undefined && usd > ctx.borrowLimitUsd) {
        return {
          valid: false,
          severity: 'error',
          message: `Exceeds your borrow limit of $${formatShort(ctx.borrowLimitUsd)}.`,
        };
      }
      // Warn at >=80% of borrow limit — close to liquidation risk
      if (ctx.borrowLimitUsd !== undefined && usd >= ctx.borrowLimitUsd * 0.8) {
        return {
          valid: true,
          severity: 'warning',
          message: 'Borrowing near your limit raises liquidation risk.',
        };
      }
      return OK;
    }

    case 'REPAY': {
      if (ctx.outstandingDebt !== undefined && value > ctx.outstandingDebt) {
        return {
          valid: false,
          severity: 'error',
          message: `You only owe ${formatShort(ctx.outstandingDebt)}.`,
        };
      }
      if (value > ctx.availableBalance) {
        return {
          valid: false,
          severity: 'error',
          message: `Exceeds your balance of ${formatShort(ctx.availableBalance)}.`,
        };
      }
      return OK;
    }

    default:
      return OK;
  }
}

function formatShort(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n);
}
