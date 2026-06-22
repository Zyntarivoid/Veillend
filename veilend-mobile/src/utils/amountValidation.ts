export type AmountValidationResult = {
  value: number | null;
  error: string | null;
  warning: string | null;
  canSubmit: boolean;
};

type ValidateAmountOptions = {
  maxAmount?: number;
  maxLabel?: string;
  warningThreshold?: number;
  warningMessage?: string;
};

const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

export function validateProtocolAmount(
  rawAmount: string,
  options: ValidateAmountOptions = {},
): AmountValidationResult {
  const normalized = rawAmount.trim().replace(/,/g, "");

  if (!normalized) {
    return result(null, "Enter an amount.");
  }

  if (!AMOUNT_PATTERN.test(normalized)) {
    return result(null, "Use numbers only.");
  }

  const value = Number(normalized);

  if (!Number.isFinite(value) || value <= 0) {
    return result(null, "Amount must be greater than 0.");
  }

  if (
    typeof options.maxAmount === "number" &&
    Number.isFinite(options.maxAmount) &&
    value > options.maxAmount
  ) {
    return result(
      value,
      `Amount exceeds ${options.maxLabel ?? "available balance"}.`,
    );
  }

  const warning =
    typeof options.warningThreshold === "number" &&
    value >= options.warningThreshold
      ? (options.warningMessage ?? null)
      : null;

  return {
    value,
    error: null,
    warning,
    canSubmit: true,
  };
}

export function formatAmountLimit(value: number, symbol: string): string {
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  })} ${symbol}`;
}

function result(value: number | null, error: string): AmountValidationResult {
  return {
    value,
    error,
    warning: null,
    canSubmit: false,
  };
}
