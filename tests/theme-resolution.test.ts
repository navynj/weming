import { describe, expect, it } from 'vitest';

import { DEFAULT_THEME, resolveTheme } from '@/lib/theme';

/**
 * The five sources (0059), every combination of each present or absent: my
 * colour here, my apply-everywhere colour, the pool's, my Home colour, the
 * app's (always there). In a pool the first present wins in that order.
 */
describe('which colour a place wears (0059)', () => {
  const flags = [false, true];
  for (const mineHere of flags)
    for (const everywhere of flags)
      for (const poolSet of flags)
        for (const homeSet of flags)
          for (const inPool of flags) {
            const name = `here ${mineHere}, everywhere ${everywhere}, pool ${poolSet}, home ${homeSet}, in a pool ${inPool}`;
            it(name, () => {
              const mine = {
                home: homeSet ? ('green' as const) : undefined,
                mode: 'light' as const,
                everywhere,
              };
              const place = inPool
                ? {
                    mine: mineHere ? ('pink' as const) : null,
                    pool: poolSet ? ('mint' as const) : null,
                  }
                : null;
              const expected = inPool
                ? mineHere
                  ? 'pink'
                  : everywhere && homeSet
                    ? 'green'
                    : poolSet
                      ? 'mint'
                      : homeSet
                        ? 'green'
                        : DEFAULT_THEME.color
                : homeSet
                  ? 'green'
                  : DEFAULT_THEME.color;
              expect(resolveTheme(mine, place)).toEqual({ color: expected, mode: 'light' });
            });
          }

  it('wears the mode chosen with the colour that wins, else my Home mode (0062)', () => {
    const mine = { home: 'green' as const, mode: 'dark' as const, everywhere: false };
    const place = {
      mine: 'pink' as const,
      pool: 'mint' as const,
      mineMode: 'light' as const,
      poolMode: 'pastel' as const,
    };
    expect(resolveTheme(mine, place)).toEqual({ color: 'pink', mode: 'light' });
    expect(resolveTheme(mine, { ...place, mineMode: null })).toEqual({
      color: 'pink',
      mode: 'dark',
    });
    expect(resolveTheme(mine, { ...place, mine: null })).toEqual({ color: 'mint', mode: 'pastel' });
    // My colour here off: its mode is not worn with the pool's colour.
    expect(resolveTheme(mine, { ...place, mine: null, poolMode: null })).toEqual({
      color: 'mint',
      mode: 'dark',
    });
    // Everywhere: my Home colour with my Home mode, over the pool's.
    expect(resolveTheme({ ...mine, everywhere: true }, { ...place, mine: null })).toEqual({
      color: 'green',
      mode: 'dark',
    });
    // No pool colour: a stray pool mode is never worn.
    expect(resolveTheme(mine, { mine: null, pool: null, poolMode: 'pastel' })).toEqual({
      color: 'green',
      mode: 'dark',
    });
    // On Home, the pool's modes are nowhere.
    expect(resolveTheme(mine, null)).toEqual({ color: 'green', mode: 'dark' });
  });

  it('says the app’s colour and mode with nothing set', () => {
    expect(resolveTheme(null, null)).toEqual(DEFAULT_THEME);
  });
});
