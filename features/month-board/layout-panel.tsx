'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { LayoutControls, type LayoutControlsProps } from './layout-controls';

/**
 * The Layout panel (review, desktop only): under the stack's top card,
 * folded to one row until opened; open, every hand-set field of the top
 * card's splash (LayoutControls). A slider moves the board at once; the
 * drafts save themselves when it rests. On Home it says whose layout is
 * drawn — the pool's or my Home override — and "Use pool layout" gives a
 * joint splash back to its pool's. The toolbar's More opens it (review,
 * direct manipulation), so it may be held open from outside.
 */
export function LayoutPanel({
  view = 'calendar',
  open: held,
  onOpenChange,
  ...controls
}: LayoutControlsProps & {
  /** Which view it edits (0045): its title says so, "Layout · Lane". */
  view?: 'calendar' | 'lane' | 'members';
  /** Open or folded, when its owner decides; else its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [own, setOwn] = useState(false);
  const open = held ?? own;
  const setOpen = (next: boolean): void => {
    setOwn(next);
    onOpenChange?.(next);
  };
  return (
    <section
      data-layout-panel={controls.card.splash.id}
      aria-label="Layout"
      className="mt-3 rounded-[24px] bg-white/10 text-white"
    >
      <button
        type="button"
        aria-expanded={open}
        data-layout-toggle
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
      >
        {layoutTitle(view)}
        <ChevronDown aria-hidden size={16} className={open ? 'rotate-180' : ''} />
      </button>
      {open ? (
        <div
          data-layout-body
          // Scrolls within itself when open, so the stack above keeps its height.
          className="no-scrollbar flex max-h-[45vh] flex-col gap-4 overflow-y-auto px-4 pb-4"
        >
          <LayoutControls {...controls} />
        </div>
      ) : null}
    </section>
  );
}

/** "Layout · Calendar", "Layout · Lane", "Layout · Members". */
export function layoutTitle(view: 'calendar' | 'lane' | 'members'): string {
  return view === 'lane'
    ? 'Layout · Lane'
    : view === 'members'
      ? 'Layout · Members'
      : 'Layout · Calendar';
}
