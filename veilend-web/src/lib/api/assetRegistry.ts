/**
 * Asset registry helpers.
 *
 * Fetches GET /assets from the backend and builds a lookup Map<contractId, entry>.
 * Falls back to a hardcoded table when the endpoint is unavailable (AC requirement).
 */

export interface AssetRegistryEntry {
  symbol: string;
  name: string;
  decimals: number;
  /** null when backend hasn't configured per-asset MCR yet */
  minCollateralRatio: number | null;
  logoUrl: string | null;
}

/** Raw shape returned by GET /assets */
interface RawAssetDto {
  symbol?: string;
  code?: string;
  name?: string;
  decimals?: number;
  contractId?: string | null;
  isNative?: boolean;
  logoUrl?: string | null;
  minCollateralRatio?: number | null;
}

// ---------------------------------------------------------------------------
// Fallback table — used when /assets is 404 (AC: log once so devs notice)
// ---------------------------------------------------------------------------

/** Known contract addresses → decimal precision override */
export const FALLBACK_CONTRACT_DECIMALS: ReadonlyMap<string, number> = new Map([
  ['CCW67TSB32XYO326XT4BKXYD35TXBOWWY6J4E54AGFZYSKSV4P2XYSSD', 6], // USDC on Stellar testnet
  ['native', 7], // XLM native
]);

/** Per-symbol MCR fallback (used when registry entry.minCollateralRatio is null) */
export const FALLBACK_MCR_BY_SYMBOL: ReadonlyMap<string, number> = new Map([
  ['XLM',  0.70],
  ['USDC', 0.90],
  ['ETH',  0.65],
  ['BTC',  0.75],
  ['WBTC', 0.75],
]);

// Log the "registry unavailable" warning at most once per server process
let _registryWarnedOnce = false;
export function warnRegistryUnavailable(): void {
  if (_registryWarnedOnce) return;
  _registryWarnedOnce = true;
  console.warn(
    '[Dashboard] /assets endpoint unavailable — falling back to hardcoded decimal table. ' +
    'Deploy B-layer /assets to fix symbol and MCR resolution.',
  );
}

// Exported only for tests
export function _resetWarnFlag(): void { _registryWarnedOnce = false; }

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildAssetRegistry(rawAssets: RawAssetDto[]): Map<string, AssetRegistryEntry> {
  const map = new Map<string, AssetRegistryEntry>();
  for (const a of rawAssets) {
    const entry: AssetRegistryEntry = {
      symbol: a.symbol ?? a.code ?? '???',
      name:   a.name  ?? '',
      decimals: a.decimals ?? 7,
      minCollateralRatio: a.minCollateralRatio ?? null,
      logoUrl: a.logoUrl ?? null,
    };
    if (a.contractId) map.set(a.contractId, entry);
    if (a.isNative)   map.set('native', entry);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** first-4…last-4 squish, e.g. GABC…DEFG (never searches for substrings) */
export function fallbackSquish(assetAddress: string): string {
  if (assetAddress.length <= 8) return assetAddress;
  return `${assetAddress.slice(0, 4)}…${assetAddress.slice(-4)}`;
}

export function registryDecimals(
  registry: Map<string, AssetRegistryEntry>,
  assetAddress: string,
): number {
  const entry = registry.get(assetAddress);
  if (entry) return entry.decimals;
  return FALLBACK_CONTRACT_DECIMALS.get(assetAddress) ?? 7;
}

export function registrySymbol(
  registry: Map<string, AssetRegistryEntry>,
  assetAddress: string,
): string {
  return registry.get(assetAddress)?.symbol ?? fallbackSquish(assetAddress);
}

export function registryName(
  registry: Map<string, AssetRegistryEntry>,
  assetAddress: string,
): string {
  return registry.get(assetAddress)?.name ?? fallbackSquish(assetAddress);
}

export function registryMcr(
  registry: Map<string, AssetRegistryEntry>,
  assetAddress: string,
): number | null {
  const entry = registry.get(assetAddress);
  if (entry) {
    if (entry.minCollateralRatio != null) return entry.minCollateralRatio;
    // Registry has the asset but MCR not yet configured — try symbol fallback
    const sym = entry.symbol.toUpperCase();
    return FALLBACK_MCR_BY_SYMBOL.get(sym) ?? null;
  }
  return null;
}
