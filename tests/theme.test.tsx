// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A person's theme (0032, H26): twelve colours that keep white readable on
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
  setPoolTheme: (poolId: string, color: unknown) => {
    saved.push({ pool: poolId, color });
    return Promise.resolve(outcome.next);
  },
  setMyPoolTheme: (poolId: string, color: unknown) => {
    saved.push({ mine: poolId, color });
    return Promise.resolve(outcome.next);
  },
}));

import { ToastProvider } from '@/components/ui/toast';
import { ThemePicker } from '@/features/people/theme-picker';
import { PlaceTheme, ThemeProvider } from '@/features/people/theme-provider';
import { asTheme, PASTEL_INK, THEMES, type ThemeColor } from '@/lib/theme';

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

describe('the twelve colours', () => {
  it('keep white readable on every one: 3:1 at least, for dark mode’s white labels', () => {
    expect(THEMES).toHaveLength(12);
    for (const t of THEMES) expect(contrast(t.hex, '#ffffff')).toBeGreaterThanOrEqual(3);
  });

  it('keep the soft grey readable on every pastel fill: 4.5:1 at least (0036)', () => {
    for (const t of THEMES) {
      expect(contrast(t.pastel.fill, PASTEL_INK), t.key).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('each has its rule in globals.css, the same hex and pastel', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8').toLowerCase();
    for (const t of THEMES) {
      expect(css).toContain(`[data-theme='${t.key}']`);
      expect(css).toContain(`--theme-900: ${t.hex.toLowerCase()};`);
      expect(css).toContain(`--theme-pastel: ${t.pastel.fill.toLowerCase()};`);
      expect(css).toContain(`--pastel-tone: ${t.pastel.tone.toLowerCase()};`);
    }
    expect(css).toContain(`--pastel-ink: ${PASTEL_INK.toLowerCase()};`);
  });

  it('reads anything unknown as the blue water, dark', () => {
    expect(asTheme('teal', 'dim')).toEqual({ color: 'blue', mode: 'dark' });
    expect(asTheme('pink', 'light')).toEqual({ color: 'pink', mode: 'light' });
    expect(asTheme('sky', 'pastel')).toEqual({ color: 'sky', mode: 'pastel' });
  });
});

function picker(pool: { pool: ThemeColor | null; mine: ThemeColor | null } | null = null) {
  saved.length = 0;
  return render(
    <ThemeProvider initial={{ home: 'blue', mode: 'dark', everywhere: false }}>
      <ToastProvider>
        {pool ? <PlaceTheme poolId="p-a" colors={pool} /> : null}
        <ThemePicker />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe('the Theme tab on Home (0059)', () => {
  it('shows the twelve swatches and the mode, the current one chosen in ink', () => {
    const { container } = picker();
    expect(container.querySelectorAll('[data-theme-swatch]')).toHaveLength(12);
    expect(
      container.querySelector('[data-theme-swatch="blue"]')!.getAttribute('aria-checked'),
    ).toBe('true');
    expect(container.querySelector('[data-theme-mode="dark"]')!.className).toContain('bg-ink');
  });

  it('stands the swatches and the mode on their own: no "My color" or "Mode" label (H43)', () => {
    const { container } = picker();
    expect(container.textContent).not.toMatch(/My color|Mode/);
    // Still named for a screen reader.
    expect(container.querySelector('[data-theme-colors="home"]')!.getAttribute('aria-label')).toBe(
      'My color',
    );
    expect(container.querySelector('[role="radiogroup"][aria-label="Mode"]')).not.toBeNull();
  });

  it('asks whether a colour applies in every pool too, and saves the answer', async () => {
    const { container } = picker();
    fireEvent.click(container.querySelector('[data-theme-swatch="pink"]')!);
    expect(container.querySelector('[data-theme-everywhere-ask]')!.textContent).toContain(
      'Apply to all pools too? Only you will see it.',
    );
    fireEvent.click(container.querySelector('[data-theme-home-only]')!);
    expect(document.documentElement.dataset.theme).toBe('pink');
    await waitFor(() => expect(saved).toEqual([{ home: 'pink', mode: 'dark', everywhere: false }]));
    fireEvent.click(container.querySelector('[data-theme-swatch="mint"]')!);
    fireEvent.click(container.querySelector('[data-theme-everywhere]')!);
    await waitFor(() =>
      expect(saved.at(-1)).toEqual({ home: 'mint', mode: 'dark', everywhere: true }),
    );
  });

  it('wears a mode on <html> at once, says "Theme saved", no Save button', async () => {
    const { container, findByRole } = picker();
    fireEvent.click(container.querySelector('[data-theme-mode="light"]')!);
    expect(document.documentElement.dataset.mode).toBe('light');
    expect((await findByRole('status')).textContent).toBe('Theme saved');
  });

  it('offers Pastel, and shows each swatch in its pastel there (0036)', async () => {
    const { container } = picker();
    const modes = [...container.querySelectorAll('[data-theme-mode]')].map((m) => m.textContent);
    expect(modes).toEqual(['Dark', 'Light', 'Pastel']);
    fireEvent.click(container.querySelector('[data-theme-mode="pastel"]')!);
    expect(document.documentElement.dataset.mode).toBe('pastel');
    const sky = container.querySelector<HTMLElement>('[data-theme-swatch="sky"]')!;
    expect(sky.style.backgroundColor).toBe('rgb(144, 197, 234)');
  });

  it('takes a refused choice back and says why', async () => {
    outcome.next = { ok: false, message: 'Sign in again to save your theme.' };
    const { container, findByRole } = picker();
    fireEvent.click(container.querySelector('[data-theme-swatch="green"]')!);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-theme-home-only]')!);
    });
    expect((await findByRole('alert')).textContent).toBe('Sign in again to save your theme.');
    expect(document.documentElement.dataset.theme).toBe('blue');
    outcome.next = { ok: true };
  });
});

describe('the Theme tab in a pool (0059)', () => {
  it('sets the pool’s colour for everyone, and mine over it, worn at once', async () => {
    const { container } = picker({ pool: null, mine: null });
    // My colour here first; the pool's default folded under its button (review).
    await waitFor(() =>
      expect(container.querySelector('[data-theme-colors="mine"]')).not.toBeNull(),
    );
    expect(container.querySelector('[data-theme-colors]')!.getAttribute('data-theme-colors')).toBe(
      'mine',
    );
    expect(container.querySelector('[data-theme-colors="pool"]')).toBeNull();
    expect(container.querySelector('[data-theme-pool-open]')!.textContent).toBe(
      'Set default color for this Pool',
    );
    fireEvent.click(container.querySelector('[data-theme-pool-open]')!);
    fireEvent.click(
      container.querySelector('[data-theme-colors="pool"] [data-theme-swatch="mint"]')!,
    );
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('mint'));
    fireEvent.click(
      container.querySelector('[data-theme-colors="mine"] [data-theme-swatch="pink"]')!,
    );
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('pink'));
    // Use my color off: mine cleared, the pool's worn again.
    const use = () =>
      container.querySelector<HTMLButtonElement>('[data-theme-use-mine] [role="switch"]')!;
    expect(use().getAttribute('aria-checked')).toBe('true');
    fireEvent.click(use());
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('mint'));
    expect(saved).toEqual([
      { pool: 'p-a', color: 'mint' },
      { mine: 'p-a', color: 'pink' },
      { mine: 'p-a', color: null },
    ]);
  });

  it('puts "Use my color" beside the heading, off by default, the swatches muted with none chosen (H43)', async () => {
    const { container } = picker({ pool: 'mint', mine: null });
    await waitFor(() => expect(container.querySelector('[data-theme-use-mine]')).not.toBeNull());
    const use = container.querySelector<HTMLButtonElement>(
      '[data-theme-use-mine] [role="switch"]',
    )!;
    expect(use.getAttribute('aria-label')).toBe('Use my color');
    expect(use.getAttribute('aria-checked')).toBe('false');
    // On the heading's line, at its far right.
    const heading = container.querySelector('[data-theme-use-mine]')!.parentElement!;
    expect(heading.textContent).toContain('My color here');
    expect(heading.lastElementChild!.hasAttribute('data-theme-use-mine')).toBe(true);
    const swatches = container.querySelector('[data-theme-colors="mine"]')!;
    expect(swatches.hasAttribute('data-muted')).toBe(true);
    expect(swatches.querySelector('[aria-checked="true"]')).toBeNull();
    expect(container.querySelector('[data-theme-clear="mine"]')).toBeNull();
    expect(container.textContent).not.toContain('Use pool color');
    expect(document.documentElement.dataset.theme).toBe('mint');
    // On with none chosen: my Home colour.
    fireEvent.click(use);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('blue'));
    expect(saved).toEqual([{ mine: 'p-a', color: 'blue' }]);
    expect(use.getAttribute('aria-checked')).toBe('true');
    expect(swatches.hasAttribute('data-muted')).toBe(false);
    expect(swatches.querySelector('[data-theme-swatch="blue"]')!.getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('turns the switch on with a swatch tapped while off (H43)', async () => {
    const { container } = picker({ pool: 'mint', mine: null });
    await waitFor(() => expect(container.querySelector('[data-theme-use-mine]')).not.toBeNull());
    fireEvent.click(
      container.querySelector('[data-theme-colors="mine"] [data-theme-swatch="pink"]')!,
    );
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('pink'));
    expect(
      container
        .querySelector('[data-theme-use-mine] [role="switch"]')!
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(saved).toEqual([{ mine: 'p-a', color: 'pink' }]);
  });

  it('shows a set pool default on its folded button; Mode stays at the bottom', async () => {
    const { container } = picker({ pool: 'mint', mine: null });
    await waitFor(() =>
      expect(container.querySelector('[data-theme-pool-swatch="mint"]')).not.toBeNull(),
    );
    expect(container.querySelector('[data-theme-pool-open]')!.textContent).toContain(
      'Pool default color:',
    );
    expect(container.querySelector('[data-theme-colors="pool"]')).toBeNull();
    const parts = [
      ...container.querySelectorAll(
        '[data-theme-colors], [data-theme-pool-open], [role="radiogroup"][aria-label="Mode"]',
      ),
    ];
    expect(parts.at(-1)!.getAttribute('aria-label')).toBe('Mode');
  });
});
