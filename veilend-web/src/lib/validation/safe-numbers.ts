import { ValidationError, type ValidationPath } from './api-schemas';

const INTEGER_PATTERN = /^-?\d+$/;

export const toSafeBigInt = (
  value: unknown,
  _path: ValidationPath = [],
): bigint | null => {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      return null;
    }
    return BigInt(value);
  }

  if (typeof value !== 'string' || !INTEGER_PATTERN.test(value)) {
    return null;
  }

  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

export const toSafeNumber = (
  value: unknown,
  decimals = 0,
  path: ValidationPath = [],
): number | null => {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 100) {
    return null;
  }

  const integer = toSafeBigInt(value, path);
  if (integer === null) {
    return null;
  }
  const converted = Number(integer) / 10 ** decimals;
  if (!Number.isFinite(converted)) {
    return null;
  }
  return converted;
};

export const requireSafeNumber = (
  value: unknown,
  decimals = 0,
  path: ValidationPath = [],
): number => {
  const converted = toSafeNumber(value, decimals, path);
  if (converted === null) {
    throw new ValidationError('Numeric value cannot be converted safely', path);
  }
  return converted;
};
