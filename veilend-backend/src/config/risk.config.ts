import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RiskConfig {
  /** Risk-scan cadence in ms. 0 disables the scanner. */
  @IsOptional()
  @IsInt()
  @Min(0)
  RISK_SCAN_INTERVAL_MS: number = 60_000;

  /** Positions loaded per batch so a large table never blocks one long query/transaction. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  RISK_SCAN_BATCH_SIZE: number = 500;

  /** Lease TTL in ms — how long a claimed scan slot is held before another replica may take over. */
  @IsOptional()
  @IsInt()
  @Min(1000)
  RISK_SCAN_LEASE_TTL_MS: number = 180_000;
}
