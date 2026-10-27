// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A person's theme (0032, H26): eleven colours that keep white readable on
 * them, worn on <html>, chosen in Settings and applied at once.
 */
const { saved, outcome } = vi.hoisted(() => ({
  saved: [] as unknown[],
  outcome: { next: { ok: true } as { ok: true } | { ok: false; message: string } },
}));
vi.mock('@/features/people/actions', () => ({
  saveTheme: (input: unknown) => {
    saved.push(input);
    return Promise.resolve(outcome.next);
  },
}));

import { ThemePicker } from '@/features/people/theme-picker';
import { ThemeProvider } from '@/features/people/theme-provider';
import { asTheme, PASTEL_INK, THEMES } from '@/lib/theme';

afterEach(() => {
  cleanup();
  saved.length = 0;
  outcome.next = { ok: true };
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.mode;
});

/** WCAG relative luminance and contrast. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('the eleven colours', () => {
  it('keep white readable on every one: 3:1 at least, for dark mode’s white labels', () => {
    expect(THEMES).toHaveLength(11);
    for (const t of THEMES) expect(contrast(t.hex, '#ffffff')).toBeGreaterThanOrEqual(3);
  });

  it('keep pastel mode’s soft grey readable on every pastel: 4.5:1 at least (0036)', () => {
    for (const t of THEMES) {
      expect(contrast(t.pastel, PASTEL_INK), t.key).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('each has its rule in globals.css, the same hex and pastel', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8').toLowerCase();
    for (const t of THEMES) {
      expect(css).toContain(`[data-theme='${t.key}']`);
      expect(css).toContain(`--theme-900: ${t.hex.toLowerCase()};`);
      expect(css).toContain(`--theme-pastel: ${t.pastel.toLowerCase()};`);
    }
    expect(css).toContain(`--pastel-ink: ${PASTEL_INK.toLowerCase()};`);
  });

  it('reads anything unknown as the blue water, dark', () => {
    expect(asTheme('teal', 'dim')).toEqual({ color: 'blue', mode: 'dark' });
    expect(asTheme('pink', 'light')).toEqual({ color: 'pink', mode: 'light' });
    expect(asTheme('sky', 'pastel')).toEqual({ color: 'sky', mode: 'pastel' });
  });
});

function picker() {
  return render(
    <ThemeProvider initial={{ color: 'blue', mode: 'dark' }}>
      <ThemePicker />
    </ThemeProvider>,
  );
}

describe('choosing a theme in Settings', () => {
  it('shows the eleven swatches and the mode, the current one chosen in ink', () => {
    const { container } = picker();
    expect(container.querySelectorAll('[data-theme-swatch]')).toHaveLength(11);
    expect(
      container.querySelector('[data-theme-swatch="blue"]')!.getAttribute('aria-checked'),
    ).toBe('true');
    expect(container.querySelector('[data-theme-mode="dark"]')!.className).toContain('bg-ink');
  });

  it('wears a colour and a mode on <html> at once, and saves them', async () => {
    const { container } = picker();
    fireEvent.click(container.querySelector('[data-theme-swatch="pink"]')!);
    expect(document.documentElement.dataset.theme).toBe('pink');
    await waitFor(() => expect(saved).toEqual([{ color: 'pink', mode: 'dark' }]));
    fireEvent.click(container.querySelector('[data-theme-mode="light"]')!);
    expect(document.documentElement.dataset.mode).toBe('light');
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]).toEqual({ color: 'pink', mode: 'light' });
  });

  it('offers Pastel, and shows each swatch in its pastel there (0036)', async () => {
    const { container } = picker();
    const modes = [...container.querySelectorAll('[data-theme-mode]')].map((m) => m.textContent);
    expect(modes).toEqual(['Dark', 'Light', 'Pastel']);
    fireEvent.click(container.querySelector('[data-theme-mode="pastel"]')!);
    expect(document.documentElement.dataset.mode).toBe('pastel');
    const sky = container.querySelector<HTMLElement>('[data-theme-swatch="sky"]')!;
    expect(sky.style.backgroundColor).toBe('rgb(168, 213, 240)');
    await waitFor(() => expect(saved.at(-1)).toEqual({ color: 'blue', mode: 'pastel' }));
  });

  it('takes a refused choice back and says why', async () => {
    outcome.next = { ok: false, message: 'Sign in again to save your theme.' };
    const { container, findByRole } = picker();
    await act(async () => {
      fireEvent.click(container.querySelector('[data-theme-swatch="green"]')!);
    });
    expect((await findByRole('alert')).textContent).toBe('Sign in again to save your theme.');
    expect(document.documentElement.dataset.theme).toBe('blue');
    expect(
      container.querySelector('[data-theme-swatch="blue"]')!.getAttribute('aria-checked'),
    ).toBe('true');
  });
});
