/**
 * Pure health-factor → risk-band classification and notification transition
 * rules for the liquidation pipeline.
 *
 * Bands:
 *   healthy      hf >= 1.5
 *   warn         1.1 <= hf < 1.5
 *   urgent       1.0 <= hf < 1.1
 *   liquidatable hf < 1.0
 *   unpriced     oracle data missing/stale — no trustworthy number
 */

export type RiskBand =
  'healthy' | 'warn' | 'urgent' | 'liquidatable' | 'unpriced';

export const RISK_BAND_THRESHOLDS = {
  warn: 1.5,
  urgent: 1.1,
  liquidatable: 1.0,
} as const;

const SEVERITY: Record<RiskBand, number> = {
  unpriced: -1,
  healthy: 0,
  warn: 1,
  urgent: 2,
  liquidatable: 3,
};

export function severityOf(band: RiskBand): number {
  return SEVERITY[band];
}

export function isRiskBand(band: RiskBand): boolean {
  return band === 'warn' || band === 'urgent' || band === 'liquidatable';
}

export function classifyHealthFactor(hf: number | null): RiskBand {
  if (hf === null || !Number.isFinite(hf)) return 'unpriced';
  if (hf < RISK_BAND_THRESHOLDS.liquidatable) return 'liquidatable';
  if (hf < RISK_BAND_THRESHOLDS.urgent) return 'urgent';
  if (hf < RISK_BAND_THRESHOLDS.warn) return 'warn';
  return 'healthy';
}

/**
 * Decides whether a scan should fire a liquidation-risk notification:
 *   - only risk bands notify;
 *   - a user whose band is unchanged since the previous scan does not
 *     re-fire (persistent-risk users are re-alerted by the notifications-
 *     service cooldown instead of every scan);
 *   - escalating severity always fires; de-escalating within risk (an
 *     improvement) stays silent;
 *   - recovering to a non-risk band clears nothing here — re-entry into a
 *     risk band afterwards compares against lastNotifiedBand and fires,
 *     which is what re-arms alerts after recovery;
 *   - `unpriced` never notifies and never disturbs lastNotifiedBand, so a
 *     transient oracle outage cannot disarm or spuriously re-arm alerts.
 */
export function shouldNotifyRisk(
  previousBand: RiskBand,
  newBand: RiskBand,
  lastNotifiedBand: RiskBand | null,
): boolean {
  if (!isRiskBand(newBand)) return false;
  if (newBand === previousBand) return false;

  // Escalation / fresh entry into risk…
  if (severityOf(newBand) > severityOf(previousBand)) {
    if (lastNotifiedBand === null) return true;
    if (newBand !== lastNotifiedBand) return true;
    // Same band as the last actual notification: only re-fire when coming
    // back from a LESS severe state (dip-and-return re-escalation).
    return severityOf(previousBand) < severityOf(lastNotifiedBand);
  }

  // …otherwise this is a de-escalation within risk: silent.
  return false;
}

/** hf − 1: how much weighted-collateral headroom remains above liquidation. */
export function distanceToLiquidation(hf: number | null): number | null {
  if (hf === null || !Number.isFinite(hf)) return null;
  return hf - 1;
}

/**
 * Uniform adverse price move (fraction, e.g. 0.25 = 25%) that would push this
 * position to hf = 1, assuming collateral and debt move together:
 *   hf / (1 - x) = 1  →  x = 1 − 1/hf. Capped at 1 (already at/below 1).
 */
export function priceMoveToLiquidation(hf: number | null): number | null {
  if (hf === null || !Number.isFinite(hf) || hf <= 0) return null;
  return Math.min(1, Math.max(0, 1 - 1 / hf));
}
