import {
  classifyHealthFactor,
  distanceToLiquidation,
  isRiskBand,
  priceMoveToLiquidation,
  severityOf,
  shouldNotifyRisk,
} from './risk-band.util';

describe('risk-band.util', () => {
  describe('classifyHealthFactor', () => {
    it.each([
      [2.0, 'healthy'],
      [1.5, 'healthy'],
      [1.49, 'warn'],
      [1.2, 'warn'],
      [1.1, 'warn'], // urgent is strictly below 1.1
      [1.09, 'urgent'],
      [1.05, 'urgent'],
      [0.99, 'liquidatable'],
      [0.5, 'liquidatable'],
      [null, 'unpriced'],
      [NaN, 'unpriced'],
      [Infinity, 'unpriced'],
    ])('classifies hf=%p as %p', (hf, expected) => {
      expect(classifyHealthFactor(hf)).toBe(expected);
    });
  });

  describe('severityOf / isRiskBand', () => {
    it('orders severity healthy < warn < urgent < liquidatable', () => {
      expect(severityOf('healthy')).toBeLessThan(severityOf('warn'));
      expect(severityOf('warn')).toBeLessThan(severityOf('urgent'));
      expect(severityOf('urgent')).toBeLessThan(severityOf('liquidatable'));
    });

    it('treats warn/urgent/liquidatable as risk but not healthy/unpriced', () => {
      expect(isRiskBand('warn')).toBe(true);
      expect(isRiskBand('urgent')).toBe(true);
      expect(isRiskBand('liquidatable')).toBe(true);
      expect(isRiskBand('healthy')).toBe(false);
      expect(isRiskBand('unpriced')).toBe(false);
    });
  });

  describe('shouldNotifyRisk', () => {
    it('fires when entering a risk band from healthy', () => {
      expect(shouldNotifyRisk('healthy', 'warn', null)).toBe(true);
      expect(shouldNotifyRisk('healthy', 'urgent', null)).toBe(true);
      expect(shouldNotifyRisk('healthy', 'liquidatable', null)).toBe(true);
    });

    it('does NOT re-fire every scan while risk persists at same severity', () => {
      expect(shouldNotifyRisk('warn', 'warn', 'warn')).toBe(false);
      expect(shouldNotifyRisk('urgent', 'urgent', 'urgent')).toBe(false);
    });

    it('fires on escalation to a more severe band', () => {
      expect(shouldNotifyRisk('warn', 'urgent', 'warn')).toBe(true);
      expect(shouldNotifyRisk('urgent', 'liquidatable', 'urgent')).toBe(true);
      // Dip-and-return: user was notified at liquidatable, recovered to warn
      // (silent), and dropped back to liquidatable — alert again.
      expect(shouldNotifyRisk('warn', 'liquidatable', 'liquidatable')).toBe(
        true,
      );
    });

    it('re-arms after recovery: re-entry into risk notifies again', () => {
      // User recovered to healthy; lastNotifiedBand stays 'warn'.
      expect(shouldNotifyRisk('healthy', 'warn', 'warn')).toBe(true);
    });

    it('never fires for unpriced or healthy target bands', () => {
      expect(shouldNotifyRisk('urgent', 'unpriced', 'urgent')).toBe(false);
      expect(shouldNotifyRisk('urgent', 'healthy', 'urgent')).toBe(false);
      expect(shouldNotifyRisk('unpriced', 'unpriced', null)).toBe(false);
    });

    it('does not fire when de-escalating within risk without recovery', () => {
      // urgent → warn is an improvement; no alert needed.
      expect(shouldNotifyRisk('urgent', 'warn', 'urgent')).toBe(false);
    });
  });

  describe('distanceToLiquidation / priceMoveToLiquidation', () => {
    it('computes hf − 1', () => {
      expect(distanceToLiquidation(1.25)).toBeCloseTo(0.25);
      expect(distanceToLiquidation(null)).toBeNull();
    });

    it('computes the adverse move that drives hf to 1.0', () => {
      // hf=2 → a uniform 50% drop reaches liquidation
      expect(priceMoveToLiquidation(2)).toBeCloseTo(0.5);
      // hf=1.25 → 20%
      expect(priceMoveToLiquidation(1.25)).toBeCloseTo(0.2);
      // already below 1 → capped at 0 additional tolerance? No: hf<=0 → null;
      // hf between 0 and 1 → max(0, 1-1/hf) = 0
      expect(priceMoveToLiquidation(0.8)).toBe(0);
      expect(priceMoveToLiquidation(null)).toBeNull();
    });
  });
});
