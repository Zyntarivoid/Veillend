/** Converts basis points to a decimal without ever rounding down. */
export function bpsToConservativeDecimal(bps: number): number {
  const value = bps / 10_000;
  // A decimal is not always exactly representable in IEEE-754. Move upward
  // only when its binary representation would otherwise be below the value.
  return value * 10_000 < bps ? Math.ceil(value * 1e12) / 1e12 : value;
}
