'use client';

import type { ReactNode } from 'react';

import { CommitRing } from '@/components/ui/waves';
import { Monogram } from '@/components/ui/monogram';
import { PersonName } from '@/features/people/avatar';

import { postIcon, type Card, type CardLane } from './grid';

/** The icon disc's diameter, and the ring's bound around it. */
const DISC_PX = 28;
const RING_PX = 96;

/**
 * A post as a row (review): in a day list — the Date view and a lane's
 * page alike — no pill
 * background, only a faint white line beneath each row. The post the stack
 * is reading is the one row at full white, its icon on a white disc; every
 * other row sits back, as every other mark does on the grid. The ring plays
 * around the icon when Home says so. A tap brings the post to the top of
 * the stack.
 */
export function PostRow({
  card,
  lane,
  current,
  ring,
  showLane = true,
  after,
  onPick,
}: {
  card: Card;
  lane: CardLane | null;
  /** The post the stack is reading: the one row at full white. */
  current: boolean;
  /** The ring's sequence number while it plays here, else null. */
  ring: number | null;
  /** The lane as a chip at the end; off on a lane's own page, where every row shares it. */
  showLane?: boolean;
  /** At the row's end, after the lane chip: a joint splash's faces and count (review). */
  after?: ReactNode;
  onPick: (id: string) => void;
}) {
  const title = card.splash.title.trim() || card.splash.ghostTitle || 'Untitled';
  const glyph = postIcon(card.splash, lane);
  return (
    <button
      type="button"
      data-pill={card.splash.id}
      data-dived={current ? undefined : ''}
      data-ring={ring !== null ? '' : undefined}
      onClick={() => onPick(card.splash.id)}
      data-joint-pill={card.joint ? '' : undefined}
      // A joint splash's row is one pill across the whole row (review), so the
      // Date view shows it is the pool's; every other row keeps its faint line.
      className={`flex w-full min-w-0 items-center gap-3 text-left text-white ${
        card.joint
          ? // The joint surface, solid (JOINT_SURFACE), as on the band.
            'my-1 rounded-full bg-[#3739D4] py-1.5 pr-3 pl-1.5'
          : 'border-b border-white/15 py-2.5'
      } ${current ? '' : 'opacity-60'}`}
    >
      <span className="relative flex shrink-0 items-center justify-center">
        {ring !== null ? (
          <span
            key={ring}
            aria-hidden
            data-commit-ripple
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-white"
          >
            <span className="flex shrink-0">
              <CommitRing size={RING_PX} contentSize={DISC_PX} gap={6} once />
            </span>
          </span>
        ) : null}
        <span
          aria-hidden
          className={`relative flex items-center justify-center rounded-full text-sm/none ${
            current ? 'bg-white' : 'bg-white/20'
          }`}
          style={{ width: DISC_PX, height: DISC_PX }}
        >
          {glyph ?? ''}
        </span>
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-sm font-semibold ${
          card.splash.title.trim() ? '' : 'opacity-60'
        }`}
      >
        {title}
      </span>
      {(card.pools ?? []).map((pool) => (
        // Shared to a pool (H23), as on the mark and the card.
        <Monogram key={pool} name={pool} size="chip" photo={card.poolPhoto ?? null} />
      ))}
      {card.author ? (
        // In a pool's Date view each row says whose it is (H23).
        <span
          data-row-author
          className="max-w-20 shrink-0 truncate text-[10px] font-medium text-white/70"
        >
          <PersonName id={card.authorId} name={card.authorName ?? card.author} />
        </span>
      ) : null}
      {showLane && lane ? (
        <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-white/25 px-2 text-[10px] text-white/80">
          {lane.icon ? <span aria-hidden>{lane.icon}</span> : null}
          {lane.name}
        </span>
      ) : null}
      {after}
    </button>
  );
}
