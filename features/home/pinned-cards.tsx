'use client';

import { useRef } from 'react';

import { useAxisLock } from '@/components/ui/use-axis-lock';
import { Avatar } from '@/features/people/avatar';
import { usePeople } from '@/features/people/people-provider';
import type { MyCategory } from '@/lib/queries/profile';

import { laneOfCard, type Card } from './grid';

/**
 * Pinned posts as cards (round 3), replacing the black strip: white at 20%
 * on the water. Three lines (review): the lane plainly, no chip; the title
 * large, the contrast carried by size; the author's initials and the latest
 * ripple on one line. One card wide;
 * with several, a horizontal snap scroller with the next card peeking at
 * the right edge. A tap brings that post to the top of the stack, and the
 * grid or the list scrolls to it with the ring. Unpinning stays in the top
 * card's menu. Absent when nothing is pinned.
 */
export function PinnedCards({
  slot,
  cards,
  categories,
  initials,
  onPick,
}: {
  /** Which slot this is: under the header (phone) or above the stack (wide); CSS shows one. */
  slot: 'phone' | 'wide';
  /** Pinned posts, most recently pinned first. */
  cards: Card[];
  categories: Pick<MyCategory, 'id' | 'icon' | 'name'>[];
  initials: string;
  onPick: (id: string) => void;
}) {
  const strip = useRef<HTMLOListElement>(null);
  const { me } = usePeople();
  useAxisLock(strip);
  if (cards.length === 0) return null;
  const several = cards.length > 1;
  return (
    <nav
      aria-label="Pinned"
      data-pinned-cards={slot}
      className={`shrink-0 ${slot === 'phone' ? 'lg:hidden' : 'hidden lg:block'}`}
    >
      <ol
        ref={strip}
        className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-6"
        style={{ scrollPaddingLeft: 16 }}
      >
        {cards.map((card) => {
          const lane = laneOfCard(card, categories);
          const title = card.splash.title.trim() || card.splash.ghostTitle || 'Untitled';
          // The latest ripple: the thread runs oldest first.
          const excerpt = card.ripples.at(-1)?.note ?? card.body;
          return (
            <li
              key={card.splash.id}
              className={`shrink-0 snap-start ${several ? 'w-[calc(100%-2.5rem)]' : 'w-full'}`}
            >
              <button
                type="button"
                data-pinned-card={card.splash.id}
                onClick={() => onPick(card.splash.id)}
                className="flex w-full flex-col gap-1 rounded-[28px] bg-white/20 px-5 py-4 text-left text-white"
              >
                {lane ? (
                  <span data-pinned-lane className="flex min-w-0 items-center gap-1 text-sm">
                    {lane.icon ? <span aria-hidden>{lane.icon}</span> : null}
                    <span className="truncate">{lane.name}</span>
                  </span>
                ) : null}
                <span data-pinned-title className="min-w-0 truncate text-2xl font-semibold">
                  {card.splash.icon ? <span aria-hidden>{card.splash.icon} </span> : null}
                  {title}
                </span>
                {excerpt ? (
                  <span className="mt-1 flex min-w-0 items-center gap-3 text-sm text-white/60">
                    <Avatar
                      id={card.ripples.at(-1)?.authorId ?? card.authorId ?? me}
                      initials={card.ripples.at(-1)?.initials ?? card.author ?? initials}
                      className="text-main-900/50 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/40 text-xs"
                    />
                    <span data-pinned-excerpt className="min-w-0 truncate">
                      {excerpt}
                    </span>
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
