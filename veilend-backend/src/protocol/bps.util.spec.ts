import { bpsToConservativeDecimal } from './bps.util';

describe('bpsToConservativeDecimal', () => {
  it.each([[10_000, 1], [12_500, 1.25], [15_001, 1.5001]])(
    'converts %i bps conservatively',
    (bps, expected) => {
      const decimal = bpsToConservativeDecimal(bps);
      expect(decimal).toBe(expected);
      expect(decimal * 10_000).toBeGreaterThanOrEqual(bps);
    },
  );
});
