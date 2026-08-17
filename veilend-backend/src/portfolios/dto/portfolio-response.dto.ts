/**
 * A single Stellar classic (Horizon) balance entry – wallet holdings, not
 * protocol positions.  These represent what the wallet actually holds on the
 * Stellar ledger; they are **not** mixed with VeilLend protocol debt.
 */
export class HorizonBalanceDto {
  /** Asset code, e.g. "XLM" or "USDC". */
  readonly assetCode: string;
  /** Issuer account ID; null for the native XLM asset. */
  readonly assetIssuer: string | null;
  /** Human-readable balance string exactly as returned by Horizon. */
  readonly balance: string;
  /** True for the native XLM trustline. */
  readonly isNative: boolean;
}

/**
 * One row from the VeilLend indexer's Position table: per-asset
 * collateral/debt state inside the protocol.
 */
export class PositionSummaryDto {
  readonly assetId: string;
  readonly assetCode: string;
  readonly assetSymbol: string;
  /** Deposited (collateral) amount, formatted using the asset's decimals. */
  readonly deposited: number;
  /** Outstanding debt, formatted using the asset's decimals. */
  readonly borrowed: number;
  readonly depositedUsd: number;
  readonly borrowedUsd: number;
  readonly healthFactor: number | null;
  readonly privacyMode: boolean;
  readonly isStale: boolean;
}

/**
 * Protocol-level aggregate summary computed from the indexer Position rows.
 * These values describe the user's state **inside the VeilLend protocol**
 * and must NOT be mixed with Horizon wallet balances.
 */
export class ProtocolSummaryDto {
  /** All per-asset positions in the VeilLend protocol. */
  readonly depositedAssets: PositionSummaryDto[];
  /** Per-asset positions with an outstanding borrow. */
  readonly borrowedAssets: PositionSummaryDto[];
  /**
   * Sum of (oracle price × deposited) across all positions (USD).
   */
  readonly collateralValue: number;
  /**
   * Sum of (oracle price × borrowed) across all positions (USD).
   */
  readonly borrowedValue: number;
  /**
   * healthFactor = collateralValue × 10_000 / (borrowedValue × MinCollateralRatioBps)
   *
   * A value ≥ 1.0 means the position is safe; below 1.0 it is at risk of
   * liquidation.  Returns Infinity when there is no outstanding debt.
   *
   * Example (150 % MCR):
   *   collateral = $2500, borrowed = $2000
   *   healthFactor = (2500 × 10000) / (2000 × 15000) = 0.833
   */
  readonly healthFactor: number;
  /**
   * max(0, collateralValue / (MinCollateralRatioBps / 10_000) − borrowedValue)
   *
   * How much more the user can borrow (in USD) before hitting the minimum
   * collateral ratio.
   */
  readonly availableToBorrow: number;
}

/**
 * Top-level portfolio response.
 *
 * `balances`  — Stellar classic wallet holdings (Horizon balances).
 * `protocol`  — VeilLend protocol position state (indexer-backed).
 *
 * The two namespaces are kept strictly separate: a native XLM balance in
 * `balances` does NOT mean the user has deposited that XLM into the protocol.
 */
export class PortfolioResponseDto {
  readonly walletAddress: string;
  /**
   * Stellar classic account balances (wallet holdings).
   * Still sourced from Horizon so the dashboard can show what the user
   * actually holds in their wallet.
   */
  readonly balances: HorizonBalanceDto[];
  /**
   * VeilLend protocol aggregate – deposited/borrowed positions and derived
   * risk metrics, all backed by the indexer's Position table.
   */
  readonly protocol: ProtocolSummaryDto;
}
