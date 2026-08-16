export const STELLAR_STROOP_FACTOR = 10_000_000;
const INTEGER_STRING = /^-?\d+$/;

export function toSafeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      return null;
    }
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }
    const asNumber = Number(trimmed);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  return null;
}

export function toSafeBigInt(value: unknown): bigint | null {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return null;
    }
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!INTEGER_STRING.test(trimmed)) {
      return null;
    }
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

export function rawStroopsToHuman(value: unknown): number | null {
  const asBigInt = toSafeBigInt(value);
  if (asBigInt !== null) {
    const human = Number(asBigInt) / STELLAR_STROOP_FACTOR;
    return Number.isFinite(human) ? human : null;
  }
  const asNumber = toSafeNumber(value);
  if (asNumber === null) {
    return null;
  }
  const human = asNumber / STELLAR_STROOP_FACTOR;
  return Number.isFinite(human) ? human : null;
}

export function pickRawAmount(
  record: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (key in record && record[key] !== undefined) {
      return record[key];
    }
  }
  return undefined;
}
