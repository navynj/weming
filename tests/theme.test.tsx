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
  setPoolTheme: (poolId: string, color: unknown, mode: unknown) => {
    saved.push({ pool: poolId, color, mode });
    return Promise.resolve(outcome.next);
  },
  setMyPoolTheme: (poolId: string, color: unknown, mode: unknown) => {
    saved.push({ mine: poolId, color, mode });
    return Promise.resolve(outcome.next);
  },
}));

import { ToastProvider } from '@/components/ui/toast';
import { ThemePicker } from '@/features/people/theme-picker';
import { PlaceTheme, ThemeProvider } from '@/features/people/theme-provider';
import { asTheme, PASTEL_INK, THEMES, type PoolColors } from '@/lib/theme';

afterEach(() => {
  cleanup();
  saved.length = 0;
  outcome.next = { ok: true };
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.mode;
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

function picker(pool: PoolColors | null = null) {
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
    const row = container.querySelector('[data-theme-pool-open]')!;
    expect(row.textContent).toBe('Set default color for this Pool');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    // Its heading and description inside, under the row: the label not said twice.
    const section = container.querySelector('[data-theme-pool]')!;
    expect(section.textContent).toContain('Pool default color');
    expect(section.textContent).toContain('Everyone here sees it');
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
      { pool: 'p-a', color: 'mint', mode: null },
      { mine: 'p-a', color: 'pink', mode: 'dark' },
      { mine: 'p-a', color: null, mode: null },
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
    expect(saved).toEqual([{ mine: 'p-a', color: 'blue', mode: 'dark' }]);
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
    expect(saved).toEqual([{ mine: 'p-a', color: 'pink', mode: 'dark' }]);
  });

  it('shows a set pool default on its folded row, before the chevron; Mode right under my color here (0062)', async () => {
    const { container } = picker({ pool: 'mint', mine: null });
    await waitFor(() =>
      expect(container.querySelector('[data-theme-pool-swatch="mint"]')).not.toBeNull(),
    );
    const row = container.querySelector('[data-theme-pool-open]')!;
    expect(row.textContent).toBe('Set default color for this Pool');
    expect(row.querySelector('[data-theme-pool-swatch="mint"]')!.nextElementSibling!.tagName).toBe(
      'svg',
    );
    expect(container.querySelector('[data-theme-colors="pool"]')).toBeNull();
    // Colour and mode are one choice: mine here, its mode, then the default.
    const order = () =>
      [
        ...container.querySelectorAll(
          '[data-theme-colors], [data-theme-modes], [data-theme-pool-open]',
        ),
      ].map(
        (el) =>
          (el.hasAttribute('data-theme-colors') &&
            `colors:${el.getAttribute('data-theme-colors')}`) ||
          (el.hasAttribute('data-theme-modes') && `modes:${el.getAttribute('data-theme-modes')}`) ||
          'open',
      );
    expect(order()).toEqual(['colors:mine', 'modes:mine', 'open']);
    // Unfolded, the default has a mode of its own under its swatches.
    fireEvent.click(row);
    expect(order()).toEqual(['colors:mine', 'modes:mine', 'open', 'colors:pool', 'modes:pool']);
  });

  it('wears the mode chosen with my colour here, and only here (0062)', async () => {
    const { container } = picker({ pool: 'mint', mine: 'pink', mineMode: null });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('pink'));
    const modes = container.querySelector('[data-theme-modes="mine"]')!;
    // No mode of its own yet: my Home mode, chosen.
    expect(modes.querySelector('[aria-checked="true"]')!.getAttribute('data-theme-mode')).toBe(
      'dark',
    );
    fireEvent.click(modes.querySelector('[data-theme-mode="light"]')!);
    await waitFor(() => expect(document.documentElement.dataset.mode).toBe('light'));
    expect(document.documentElement.dataset.theme).toBe('pink');
    expect(saved).toEqual([{ mine: 'p-a', color: 'pink', mode: 'light' }]);
    // A colour picked after keeps the mode it goes with.
    fireEvent.click(
      container.querySelector('[data-theme-colors="mine"] [data-theme-swatch="sky"]')!,
    );
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('sky'));
    expect(document.documentElement.dataset.mode).toBe('light');
    expect(saved.at(-1)).toEqual({ mine: 'p-a', color: 'sky', mode: 'light' });
    // No Home mode control in a pool: the mode here is the one.
    expect(container.querySelector('[data-theme-modes="home"]')).toBeNull();
  });

  it('turns my colour here on with the colour worn now when a mode is tapped while off (0062)', async () => {
    const { container } = picker({ pool: 'mint', mine: null });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('mint'));
    const modes = container.querySelector('[data-theme-modes="mine"]')!;
    expect(modes.hasAttribute('data-muted')).toBe(true);
    expect(modes.querySelector('[aria-checked="true"]')).toBeNull();
    fireEvent.click(modes.querySelector('[data-theme-mode="pastel"]')!);
    await waitFor(() => expect(document.documentElement.dataset.mode).toBe('pastel'));
    expect(saved).toEqual([{ mine: 'p-a', color: 'mint', mode: 'pastel' }]);
    expect(
      container
        .querySelector('[data-theme-use-mine] [role="switch"]')!
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('gives the pool’s default a mode of its own, worn by whoever uses no colour here (0062)', async () => {
    const { container } = picker({ pool: 'mint', mine: null, poolMode: null });
    await waitFor(() => expect(container.querySelector('[data-theme-pool-open]')).not.toBeNull());
    fireEvent.click(container.querySelector('[data-theme-pool-open]')!);
    const modes = container.querySelector('[data-theme-modes="pool"]')!;
    // None chosen: each member's own.
    expect(modes.querySelector('[aria-checked="true"]')).toBeNull();
    fireEvent.click(modes.querySelector('[data-theme-mode="light"]')!);
    await waitFor(() => expect(document.documentElement.dataset.mode).toBe('light'));
    expect(document.documentElement.dataset.theme).toBe('mint');
    expect(saved).toEqual([{ pool: 'p-a', color: 'mint', mode: 'light' }]);
    // Cleared, the colour takes its mode with it; nothing left to choose a mode for.
    fireEvent.click(container.querySelector('[data-theme-clear="pool"]')!);
    await waitFor(() => expect(document.documentElement.dataset.mode).toBe('dark'));
    expect(saved.at(-1)).toEqual({ pool: 'p-a', color: null, mode: null });
    const after = container.querySelector('[data-theme-modes="pool"]')!;
    expect(after.querySelector('[aria-checked="true"]')).toBeNull();
    expect(after.querySelector<HTMLButtonElement>('[data-theme-mode="light"]')!.disabled).toBe(
      true,
    );
  });

  it('folds the pool default again from the same row', async () => {
    const { container } = picker({ pool: 'mint', mine: null });
    await waitFor(() => expect(container.querySelector('[data-theme-pool-open]')).not.toBeNull());
    const row = container.querySelector('[data-theme-pool-open]')!;
    fireEvent.click(row);
    expect(container.querySelector('[data-theme-colors="pool"]')).not.toBeNull();
    fireEvent.click(row);
    expect(container.querySelector('[data-theme-colors="pool"]')).toBeNull();
  });

  it('offers None as the pool default’s last swatch, ringed like the rest when chosen', async () => {
    const { container } = picker({ pool: 'mint', mine: null });
    await waitFor(() => expect(container.querySelector('[data-theme-pool-open]')).not.toBeNull());
    fireEvent.click(container.querySelector('[data-theme-pool-open]')!);
    const grid = container.querySelector('[data-theme-colors="pool"]')!;
    const none = grid.lastElementChild as HTMLButtonElement;
    expect(none.getAttribute('data-theme-clear')).toBe('pool');
    expect(none.getAttribute('aria-label')).toBe('None');
    expect(none.getAttribute('title')).toBe('None');
    expect(none.textContent).toBe('');
    expect(none.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(none);
    await waitFor(() => expect(none.getAttribute('aria-checked')).toBe('true'));
    expect(none.className).toContain('ring-ink');
    expect(saved).toEqual([{ pool: 'p-a', color: null, mode: null }]);
  });
});
