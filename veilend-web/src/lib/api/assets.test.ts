import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchSupportedAssets } from './assets';

describe('fetchSupportedAssets response validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects a corrupt payload as a whole and uses the warned fallback once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json([
        {
          code: 'USDC',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 'six',
          isSupported: true,
        },
      ]),
    );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);

    const assets = await fetchSupportedAssets();

    expect(assets[0]?.symbol).toBe('USDC');
    expect(assets[0]?.decimals).toBe(7);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('validation'),
      expect.any(Error),
    );
  });
});
