'use client';

import { monogram } from '@/features/pool/monogram';
import { useStableUrl } from '@/lib/use-stable-media';

const SIZES = {
  // The create screen's tile (1c), beside the name field.
  tile: 'h-[76px] w-[76px] rounded-2xl text-2xl',
  // A row in the switcher.
  row: 'h-10 w-10 rounded-xl text-sm',
  // On a card or a mark on Home: which pool a post is shared to.
  chip: 'h-4 min-w-4 rounded px-0.5 text-[10px]',
  // On the calendar on Home, in a joint splash's faces' place: a face's size.
  face: 'h-3 min-w-3 overflow-hidden rounded-[3px] px-px text-[10px] leading-none',
  // A Home column of a pool's Just-mine splashes, where an emoji would be.
  head: 'h-7 w-7 rounded-lg text-[10px]',
  // A pool on the strip at the foot (review): a 40px rounded square, so a
  // pool never reads as a person (people are circles).
  nav: 'h-10 w-10 rounded-lg text-sm',
} as const;

/**
 * A pool's monogram tile (1c): two characters of its name in blue on the
 * pale tint, a rounded square. The pale tint is a surface, never text, and
 * the blue is the emphasis colour; the tile is a name, not an action.
 */
export function Monogram({
  name,
  size = 'row',
  photo = null,
  className = '',
}: {
  name: string;
  size?: keyof typeof SIZES;
  /** The pool's photo (0024), drawn in the same tile; the letters when there is none. */
  photo?: string | null;
  className?: string;
}) {
  const letters = monogram(name);
  // The URL this browser keeps for the photo's version (2026-10-30), so a
  // page another server instance signed draws from the cache.
  const kept = useStableUrl(photo);
  if (kept) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={kept}
        alt=""
        aria-hidden
        data-monogram={letters}
        data-pool-photo
        draggable={false}
        className={`inline-flex shrink-0 object-cover ${SIZES[size]} ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      data-monogram={letters}
      className={`bg-main-100/60 text-main-900 border-main-900/25 inline-flex shrink-0 items-center justify-center font-semibold ${
        size === 'tile' ? 'border-2' : ''
      } ${SIZES[size]} ${className}`}
    >
      {letters || '·'}
    </span>
  );
}
