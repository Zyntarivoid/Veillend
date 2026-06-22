const DECIMAL_AMOUNT_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

export type AmountValidation = {
  error: string | null;
  normalizedAmount: string;
  value: number;
  warning: string | null;
};

type BalanceValidationOptions = {
  availableBalance?: number;
  symbol: string;
};

type BorrowValidationOptions = {
  borrowLimitUsd: number;
  currentBorrowedUsd: number;
  priceUsd: number;
};

type RepayValidationOptions = BalanceValidationOptions & {
  amountOwed: number;
};

const invalidResult = (message: string, normalizedAmount = '', value = 0): AmountValidation => ({
  error: message,
  normalizedAmount,
  value,
  warning: null,
});

const formatAmount = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 6 });

const formatUsd = (value: number): string =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const validateBaseAmount = (amount: string): AmountValidation => {
  const rawAmount = amount.trim();

  if (!rawAmount) {
    return invalidResult('Enter an amount before continuing.');
  }

  if (!DECIMAL_AMOUNT_PATTERN.test(rawAmount)) {
    return invalidResult('Use a positive number with digits and one decimal point only.', rawAmount);
  }

  const value = Number(rawAmount);
  if (!Number.isFinite(value) || value <= 0) {
    return invalidResult('Amount must be greater than 0.', rawAmount, value);
  }

  return {
    error: null,
    normalizedAmount: String(value),
    value,
    warning: null,
  };
};

const balanceWarning = ({ availableBalance, symbol }: BalanceValidationOptions, value: number): string | null => {
  if (availableBalance === undefined || availableBalance <= 0) {
    return null;
  }

  if (value >= availableBalance * 0.9) {
    return `This uses most of your ${symbol} balance. Keep enough aside for fees.`;
  }

  return null;
};

export const validateDepositAmount = (
  amount: string,
  options: BalanceValidationOptions,
): AmountValidation => {
  const result = validateBaseAmount(amount);
  if (result.error) return result;

  if (options.availableBalance !== undefined && result.value > options.availableBalance) {
    return invalidResult(
      `Enter ${options.symbol} amount no greater than your ${formatAmount(options.availableBalance)} ${options.symbol} balance.`,
      result.normalizedAmount,
      result.value,
    );
  }

  return {
    ...result,
    warning: balanceWarning(options, result.value),
  };
};

export const validateBorrowAmount = (
  amount: string,
  { borrowLimitUsd, currentBorrowedUsd, priceUsd }: BorrowValidationOptions,
): AmountValidation => {
  const result = validateBaseAmount(amount);
  if (result.error) return result;

  const remainingLimitUsd = Math.max(borrowLimitUsd - currentBorrowedUsd, 0);
  const requestedUsd = result.value * priceUsd;

  if (requestedUsd > remainingLimitUsd) {
    return invalidResult(
      `This exceeds your remaining borrow limit of ${formatUsd(remainingLimitUsd)}.`,
      result.normalizedAmount,
      result.value,
    );
  }

  return {
    ...result,
    warning:
      remainingLimitUsd > 0 && requestedUsd >= remainingLimitUsd * 0.8
        ? 'This uses most of your borrow limit and can increase liquidation risk.'
        : null,
  };
};

export const validateRepayAmount = (
  amount: string,
  options: RepayValidationOptions,
): AmountValidation => {
  const result = validateBaseAmount(amount);
  if (result.error) return result;

  if (result.value > options.amountOwed) {
    return invalidResult(
      `Repay up to ${formatAmount(options.amountOwed)} ${options.symbol}, the amount you owe.`,
      result.normalizedAmount,
      result.value,
    );
  }

  if (options.availableBalance !== undefined && result.value > options.availableBalance) {
    return invalidResult(
      `Your wallet balance is ${formatAmount(options.availableBalance)} ${options.symbol}. Enter a smaller amount.`,
      result.normalizedAmount,
      result.value,
    );
  }

  return {
    ...result,
    warning:
      balanceWarning(options, result.value) ??
      (result.value < options.amountOwed
        ? `Partial repayment leaves ${formatAmount(options.amountOwed - result.value)} ${options.symbol} outstanding.`
        : null),
  };
};
