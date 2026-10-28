'use client';

import { Sparkle } from 'lucide-react';

import { useTheme } from '@/features/people/theme-provider';
import { THEMES } from '@/lib/theme';

import { LABEL_STYLES, type LabelStyle } from './layout';

/** A style a person can choose for any label (0058). */
export type LabelChoice = (typeof LABEL_STYLES)[number];

/** A label drawn in each style, as the board draws it (board-pieces' LABEL_CLASS). */
const SAMPLE: Record<LabelStyle, string> = {
  none: 'text-white',
  white: 'label-fill bg-white text-main-900',
  ink: 'label-ink bg-ink text-white',
  pale: 'bg-white/20 text-white',
  glass: 'bg-white/20 text-white ring-1 ring-inset ring-white/30',
};

/**
 * The styles as they look (Yoonji, in the session): `white` is white on the
 * dark ground, but in light mode the ground's white is my theme colour, so
 * it is named after it ("Pink"), as in pastel mode, its pastel; `ink` is
 * "Black", and in pastel mode, nearly white, "Pale". The toolbar's swatch,
 * the panel and More all say them so.
 */
export function useLabelStyleNames(): Record<LabelChoice, string> {
  const { theme } = useTheme();
  return {
    none: 'None',
    white:
      theme.mode === 'dark'
        ? 'White'
        : (THEMES.find((t) => t.key === theme.color)?.name ?? 'White'),
    ink: theme.mode === 'pastel' ? 'Pale' : 'Black',
    glass: 'Glass',
  };
}

/**
 * A style shown as it looks: "Aa" in it, on a square of the water, so a
 * white label, glass and no fill all read on the white toolbar.
 */
export function LabelSwatch({ style, px = 24 }: { style: LabelStyle; px?: number }) {
  return (
    <span
      aria-hidden
      data-label-swatch={style}
      className="water-ground flex shrink-0 items-center justify-center rounded-md"
      style={{ width: px, height: px }}
    >
      <span className={`rounded-sm px-0.5 text-[10px] leading-4 font-semibold ${SAMPLE[style]}`}>
        Aa
      </span>
    </span>
  );
}

/**
 * Auto as a swatch of its own (review): the swatch's size, a dashed outline
 * and an "A" with a small sparkle, never filled — the rule picks the style.
 */
export function AutoSwatch({ px = 24 }: { px?: number }) {
  return (
    <span
      aria-hidden
      data-label-swatch="auto"
      className="border-pool-500 text-pool-500 relative flex shrink-0 items-center justify-center rounded-md border border-dashed"
      style={{ width: px, height: px }}
    >
      <span className="text-[10px] leading-none font-semibold">A</span>
      <Sparkle aria-hidden size={6} strokeWidth={3} className="absolute top-0.5 right-0.5" />
    </span>
  );
}

/**
 * The chosen style's marker (review): a 4px ink dot centred 4px under the
 * option, never a fill — the swatches are fills, so a filled background
 * would read as one more style. Inside a `relative` option; nothing when
 * the option is not the chosen one.
 */
export function ChosenDot({ on }: { on: boolean }) {
  return on ? (
    <span
      aria-hidden
      data-chosen-dot
      className="bg-ink absolute top-full left-1/2 mt-1 h-1 w-1 -translate-x-1/2 rounded-full"
    />
  ) : null;
}
