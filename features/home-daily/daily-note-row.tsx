'use client';

import { useRippleSheet } from '@/features/ripple-sheet/sheet-host';
import type { RippleWithSplash } from '@/lib/queries/ripples';

/**
 * One record that belongs to a date without a time (SPEC 5.3).
 *
 * Its own component because two surfaces show them: Home's Daily Note area,
 * where they sit above the axis, and the Trail, where they head their day's
 * section. The grammar has to be the same in both, and the only way to
 * guarantee that is for there to be one of it.
 */
export function DailyNoteRow({ note }: { note: RippleWithSplash }) {
  const { openRipple } = useRippleSheet();

  return (
    <button
      type="button"
      onClick={() => openRipple(note.id)}
      className="text-ink flex items-baseline gap-2 text-left text-sm"
    >
      <span>{note.note}</span>
    </button>
  );
}
