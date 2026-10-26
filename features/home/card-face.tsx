'use client';

import Link from 'next/link';

import { OutlineChip } from '@/components/ui/chips/category-chip';
import { splashHref } from '@/features/home/scope';
import { RippleThread } from '@/features/splash/ripple-thread';
import { DETAIL_TITLE_CLASS } from '@/features/splash/splash-header';
import { Monogram } from '@/components/ui/monogram';
import { usePeople } from '@/features/people/people-provider';

import { cardDate, postIcon, type Card, type CardLane } from './grid';

/** The top card's height, fixed so the grid above never moves when the stack changes. */
export const CARD_PX = 200;
/** A card's padding, the same on top, at the sides and at the bottom (review). */
export const CARD_PAD_PX = 20;
/** A peeking card's edge: one line — this much padding, the emoji, the title, nothing else. */
export const EDGE_PAD_PX = { top: 8, bottom: 12 } as const;
/** A spine on the sideways stair: this wide. */
export const SPINE_PX = 44;
/** Each step back tints the white face this much toward the water. */
export const TINT_STEP = 0.08;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** White stepped toward #0507C9 by `tint`: the depth cue of a card behind another. */
export function face(tint: number): string {
  const t = clamp01(tint);
  return `rgb(${Math.round(lerp(255, 5, t))}, ${Math.round(lerp(255, 7, t))}, ${Math.round(lerp(255, 201, t))})`;
}

/**
 * What a card reads (H22, review): on the top card, the emoji with the
 * title in blue at the detail title's size, then the date with its weekday
 * and the lane as an outline chip, the author's initials, and the body —
 * every block's words oldest first, a long one sinking into the face's own
 * colour. A card on a stair shows only its title line, small, on the edge
 * that peeks out: its top edge above the top card, its bottom edge below.
 * Tap = the post's page. Shared by both boards.
 */
export function CardFace({
  card,
  lane,
  initials,
  edge,
  ink = 'blue',
  href,
  onClickCapture,
}: {
  card: Card;
  lane: CardLane | null;
  initials: string;
  /** Everything, or the title line on the edge that shows: a top or bottom band, or a left or right spine. */
  edge: 'full' | 'top' | 'bottom' | 'left' | 'right';
  /** The title's colour: blue on a pale face, white on a card in the water. */
  ink?: 'blue' | 'white';
  /** Where the full card opens: the post's page, coming back to Home by default. */
  href?: string;
  onClickCapture?: (event: React.MouseEvent) => void;
}) {
  const { me } = usePeople();
  const title = card.splash.title.trim() || card.splash.ghostTitle || 'Untitled';
  // The post's own icon, else its lane's emoji (0008).
  const glyph = postIcon(card.splash, lane);
  const inkClass = ink === 'white' ? 'text-white' : 'text-main-900';
  if (edge === 'left' || edge === 'right') {
    // A book spine: the emoji at the top, the title written downward and
    // ellipsised to the card's height.
    return (
      <span
        aria-hidden
        data-card-spine=""
        className={`absolute inset-y-0 flex flex-col items-center ${inkClass} ${edge === 'left' ? 'left-0' : 'right-0'}`}
        style={{
          width: SPINE_PX,
          paddingTop: EDGE_PAD_PX.bottom,
          paddingBottom: EDGE_PAD_PX.bottom,
          opacity: ink === 'white' ? 'var(--ink-opacity, 0.6)' : undefined,
        }}
      >
        {glyph ? <span className="text-base/none">{glyph}</span> : null}
        <span
          data-card-title
          className={`mt-2 min-h-0 flex-1 overflow-hidden text-sm/none font-semibold text-ellipsis whitespace-nowrap ${
            card.splash.title.trim() ? '' : 'opacity-40'
          }`}
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          {title}
        </span>
      </span>
    );
  }
  const titleLine = (
    <span
      data-card-title
      className={`flex min-w-0 shrink-0 items-center gap-1.5 ${
        ink === 'white' ? 'text-white' : 'text-main-900'
      } ${edge === 'full' ? `${DETAIL_TITLE_CLASS} pr-8 leading-tight` : 'text-sm/none font-semibold'}`}
      style={ink === 'white' ? { opacity: 'var(--ink-opacity, 0.6)' } : undefined}
    >
      {glyph ? <span aria-hidden>{glyph}</span> : null}
      <span className={`truncate ${card.splash.title.trim() ? '' : 'opacity-40'}`}>{title}</span>
    </span>
  );
  if (edge !== 'full') {
    return (
      <span
        aria-hidden
        className={`flex h-full flex-col px-5 ${edge === 'top' ? 'justify-start' : 'justify-end'}`}
        style={{ paddingTop: EDGE_PAD_PX.top, paddingBottom: EDGE_PAD_PX.bottom }}
      >
        {titleLine}
      </span>
    );
  }
  return (
    <Link
      href={href ?? card.href ?? splashHref(card.splash.id)}
      data-card-link={card.splash.id}
      onClickCapture={onClickCapture}
      draggable={false}
      className="flex h-full flex-col gap-1.5 px-5"
      style={{ paddingTop: CARD_PAD_PX, paddingBottom: CARD_PAD_PX }}
    >
      {titleLine}
      <span className="flex items-start justify-between gap-3">
        <span data-card-date className="text-main-900 text-sm font-medium tabular-nums">
          {cardDate(card.day)}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {/* Where the post is shared (H23): one monogram per pool. */}
          {(card.pools ?? []).map((pool) => (
            <Monogram key={pool} name={pool} size="chip" photo={card.poolPhoto ?? null} />
          ))}
          {lane ? <OutlineChip icon={lane.icon} name={lane.name} /> : null}
        </span>
      </span>
      {card.origins && card.origins.length > 0 ? (
        <span data-origin-tags className="text-pool-500 flex flex-wrap gap-x-3 text-[10px]/tight">
          {card.origins.map((tag) => (
            <span key={tag} data-origin-tag>
              {tag}
            </span>
          ))}
        </span>
      ) : null}
      <span data-card-body className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Each ripple an entry of its own, threaded avatar to avatar (round 3). */}
        <RippleThread
          initials={card.author ?? initials}
          authorId={card.authorId ?? me}
          entries={(card.ripples.length > 0
            ? card.ripples
            : [
                {
                  id: card.splash.id,
                  note: card.body,
                  createdAt: '',
                  initials: card.author,
                  authorId: card.authorId,
                },
              ]
          ).map((ripple) => ({
            id: ripple.id,
            initials: ripple.initials,
            authorId: ripple.authorId,
            body: (
              <span className="text-ink/80 text-[13px]/relaxed whitespace-pre-wrap">
                {ripple.note}
              </span>
            ),
          }))}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--face, #fff))' }}
        />
      </span>
    </Link>
  );
}
