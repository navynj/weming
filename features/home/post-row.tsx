'use client';

import type { ReactNode } from 'react';
import { Heart } from 'lucide-react';

import { CommitRing } from '@/components/ui/waves';
import { Monogram } from '@/components/ui/monogram';
import { Avatar, PersonName } from '@/features/people/avatar';

import { postIcon, type Card, type CardLane } from './grid';

/** The icon's room, and the ring's bound around it. */
const DISC_PX = 28;
const RING_PX = 96;

/**
 * A post as a row (review): in a day list — the List view and a lane's page
 * alike — a plain line with no background of any kind: its icon, its title,
 * its lane chip (its pool's monogram instead, on Home, where it is shared),
 * a joint record's faces, and how many reactions it has, if any. The date
 * dividers above join the rows. The post the stack is reading is the one row
 * in full white; the others at 85%. The ring plays around the icon when Home
 * says so. A tap brings the post to the top of the stack.
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
  // What readers left on it (H25), counted; nothing when nobody has.
  const reactions = card.responded?.value.reactions.length ?? 0;
  return (
    <button
      type="button"
      data-pill={card.splash.id}
      data-dived={current ? undefined : ''}
      data-ring={ring !== null ? '' : undefined}
      onClick={() => onPick(card.splash.id)}
      data-joint-pill={card.together ? '' : undefined}
      className={`flex w-full min-w-0 items-center gap-3 py-2 text-left ${
        current ? 'text-white' : 'text-white/85'
      }`}
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
          className="relative flex items-center justify-center text-base/none"
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
        // Shared to a pool (H23), in the lane chip's place on Home.
        <Monogram key={pool} name={pool} size="chip" photo={card.poolPhoto ?? null} />
      ))}
      {card.authorFace && card.authorId && !(card.joint || card.together) ? (
        // Whose it is, as a face after the title (review), its name beside it.
        <span data-row-author-face className="flex shrink-0">
          <Avatar
            id={card.authorId}
            initials={card.author ?? ''}
            className="text-main-900/60 bg-joint-face flex items-center justify-center overflow-hidden rounded-full leading-none"
            style={{ width: 14, height: 14, fontSize: 6 }} // allow-small-text: initials sized with the face
          />
        </span>
      ) : null}
      {card.author ? (
        // In a pool's Date view each row says whose it is (H23).
        <span
          data-row-author
          className="max-w-20 shrink-0 truncate text-[10px] font-medium text-white/70"
        >
          <PersonName id={card.authorId} name={card.authorName ?? card.author} />
        </span>
      ) : null}
      {showLane && lane && !card.pools?.length ? (
        <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-white/25 px-2 text-[10px] text-white/80">
          {lane.icon ? <span aria-hidden>{lane.icon}</span> : null}
          {lane.name}
        </span>
      ) : null}
      {after}
      {reactions > 0 ? (
        <span
          data-row-reactions
          aria-label={`${reactions} reaction${reactions === 1 ? '' : 's'}`}
          className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-white/70"
        >
          <Heart aria-hidden size={10} />
          {reactions}
        </span>
      ) : null}
    </button>
  );
}
