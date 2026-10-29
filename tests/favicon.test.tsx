// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/people/actions', () => ({
  saveTheme: vi.fn(),
  setMyPoolTheme: vi.fn(),
  setPoolTheme: vi.fn(),
}));

import { PlaceTheme, ThemeProvider } from '@/features/people/theme-provider';
import { faviconSvg } from '@/lib/favicon';
import { themeHex } from '@/lib/theme';

/** The tab's icon (2026-10-29): the wave mark on the colour the place wears. */

afterEach(cleanup);

const icon = (): string =>
  decodeURIComponent(
    document.querySelector('link[rel="icon"]')!.getAttribute('href')!.split(',')[1],
  );

describe('the favicon', () => {
  it('is three white waves on the colour it is given', () => {
    const svg = faviconSvg('#D92D20');
    expect(svg).toContain('fill="#D92D20"');
    expect(svg.match(/<path /g)).toHaveLength(3);
    expect(svg).toContain('stroke="#fff"');
  });

  it('wears my Home colour, and its full colour in pastel mode', () => {
    render(
      <ThemeProvider initial={{ home: 'green', mode: 'pastel', everywhere: false }}>
        <p />
      </ThemeProvider>,
    );
    expect(icon()).toBe(faviconSvg(themeHex('green')));
  });

  it('wears a pool’s colour while I am in it', () => {
    render(
      <ThemeProvider initial={{ home: 'blue', mode: 'dark', everywhere: false }}>
        <PlaceTheme poolId="p1" colors={{ pool: 'red', mine: null }} />
      </ThemeProvider>,
    );
    expect(icon()).toBe(faviconSvg(themeHex('red')));
  });
});
