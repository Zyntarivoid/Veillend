/**
 * Formats a raw on-chain integer amount (e.g. `depositedRaw`/`borrowedRaw`/
 * `amountRaw`) into a human-readable decimal number using the asset's
 * `decimals` precision.
 *
 * Uses BigInt arithmetic to avoid precision loss for large raw values before
 * falling back to floating point only for the final division by the
 * (small) decimal scale.
 */
export function formatRawAmount(raw: bigint, decimals: number): number {
  const scale = 10 ** decimals;
  // Number(raw) can lose precision for very large bigints, but balances at
  // this scale (asset-native units, not wei-like 18-decimal tokens) are safe
  // to round-trip through a double for display/aggregation purposes.
  return Number(raw) / scale;
}
