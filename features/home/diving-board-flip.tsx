'use client';

import { useTheme } from '@/features/people/theme-provider';
import { useRef } from 'react';
import { motion, useTransform, type PanInfo } from 'motion/react';

import { usePrefersReducedMotion } from '@/components/ui/waves/use-reduced-motion';
import type { MyCategory } from '@/lib/queries/profile';

import { CARD_PX, CardFace, face, TINT_STEP } from './card-face';
import { cardDate, cardLane, postIcon, type Card } from './grid';
import type { Flip } from './use-flip';

/** How much of each back card shows above the one in front: its title line. */
export const PEEK_PX = 28;
/** How many back cards show. */
const PEEKS = 3;
/** The hinge: the top card's bottom edge, where a page turns. */
const HINGE_PX = PEEKS * PEEK_PX + CARD_PX;
/** The pile beneath the hinge: turned pages as strips, newest-turned on top. */
const PILE_TOP_PX = HINGE_PX + 6;
const STRIP_PX = 28;
const STRIP_STEP_PX = 32;
const PILE_VISIBLE = 3;
/** The board's height: the peeks, the card, the pile and its count line. */
export const STACK_PX = PILE_TOP_PX + PILE_VISIBLE * STRIP_STEP_PX + 14;
/** Each step back draws the face in this much per side. */
const SHRINK_PX = 8;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/**
 * The diving board (H22, review): the newest posts as a stack of white
 * cards, the top one read in full and up to three behind it showing their
 * title line, each a step darker and a step narrower — a stack of paper. A page turns like a
 * page: the top card hinges on its bottom edge and rotates down toward the
 * viewer, showing a plain darker back past the halfway point, and lands on
 * the **pile** beneath as a title strip, newest-turned on top; the next
 * card is already in place behind it and only steps up one slot. Up to
 * three strips show, then a count. A strip dragged or tapped turns back up,
 * and every strip above it comes back in the same motion. The pile is the
 * read side, the stack the unread side; the grid's ring follows the top of
 * the unread side.
 *
 * Every page's seat is a function of the turn's one scalar `p`: its turn
 * progress `t` (0 unread, 1 in the pile) and the stack's fractional depth
 * `n`, so the pages behind step up as one lands. Under reduced motion the
 * pages take their seats at once and crossfade on `p`.
 *
 * Kept beside the dive board (`diving-board-dive.tsx`) behind one switch in
 * Home, so either can be chosen.
 */
export function FlipBoard({
  cards,
  flip,
  categories,
  initials,
}: {
  /** Newest first, in the order `flip.ids` follows. */
  cards: Card[];
  flip: Flip;
  categories: MyCategory[];
  initials: string;
}) {
  const { ids, n, next } = flip;
  const byId = new Map(cards.map((card) => [card.splash.id, card]));
  // Only what can be seen is rendered: the stack's faces, the pile's strips,
  // and the pages turning between them.
  const first = Math.max(0, Math.min(n, next) - PILE_VISIBLE);
  const last = Math.min(ids.length - 1, Math.max(n, next) + PEEKS);
  const pages: number[] = [];
  for (let i = first; i <= last; i += 1) pages.push(i);
  const buried = Math.max(0, n - PILE_VISIBLE);

  return (
    <div data-diving-board data-board="flip" className="relative shrink-0 px-4">
      {cards.length > 0 ? (
        <div
          data-stack
          className="relative select-none"
          style={{ height: STACK_PX, perspective: 1200, touchAction: 'none' }}
        >
          {pages.map((i) => {
            const card = byId.get(ids[i]);
            return card ? (
              <Page
                key={card.splash.id}
                card={card}
                index={i}
                flip={flip}
                lane={categories.find((c) => c.id === cardLane(card.splash)) ?? null}
                initials={initials}
              />
            ) : null;
          })}
          {buried > 0 ? (
            <span
              data-pile-count
              className="absolute left-5 text-[11px]/none font-medium text-white/60 tabular-nums"
              style={{ top: PILE_TOP_PX + PILE_VISIBLE * STRIP_STEP_PX }}
            >
              +{buried} read
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One post on the board, in both of its forms: the card face while unread
 * and the strip once turned. `t` runs 0 → 1 as it turns; the face rotates
 * away over the first half, the strip lands over the second.
 */
function Page({
  card,
  index,
  flip,
  lane,
  initials,
}: {
  card: Card;
  index: number;
  flip: Flip;
  lane: MyCategory | null;
  initials: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const { p, ids, n, next } = flip;
  const i = index;
  const wasTurned = i < n ? 1 : 0;
  const willBeTurned = i < next ? 1 : 0;
  const turning = wasTurned !== willBeTurned;
  const forward = turning && willBeTurned === 1;

  // The turn's progress for this page, and the stack's depth under it.
  const t = useTransform(p, (v) =>
    reducedMotion ? willBeTurned : lerp(wasTurned, willBeTurned, clamp01(v)),
  );
  const depth = useTransform(p, (v) => (reducedMotion ? next : lerp(n, next, clamp01(v))));
  const slot = useTransform(depth, (d) => Math.max(0, i - d));
  const pileSlot = useTransform(depth, (d) => Math.max(0, d - 1 - i));

  // The face: seated by slot, turning down about its bottom edge.
  const faceY = useTransform(slot, (s) => PEEKS * PEEK_PX - s * PEEK_PX);
  const faceRotate = useTransform(t, (v) => (reducedMotion ? 0 : -Math.min(90, v * 180)));
  const faceOpacity = useTransform([t, p], ([v, pv]) => {
    const s = i - lerp(n, next, clamp01(pv as number));
    if (s > PEEKS + 0.5) return 0;
    if (reducedMotion && turning)
      return forward ? 1 - clamp01(pv as number) : clamp01(pv as number);
    return (v as number) < 0.5 ? 1 : 0;
  });
  const { hex } = useTheme();
  const faceBg = useTransform(slot, (s) => face(s * TINT_STEP, hex));
  // A card behind is narrower than the one in front (review).
  const faceInset = useTransform(slot, (s) => s * SHRINK_PX);
  const faceZ = useTransform([t, slot], ([v, s]) =>
    (v as number) > 0 && (v as number) < 1 ? 40 : 20 - Math.round(s as number),
  );

  // The strip: landing about its top edge at the hinge, seated by pile slot.
  const stripY = useTransform(pileSlot, (s) => PILE_TOP_PX + s * STRIP_STEP_PX);
  const stripRotate = useTransform(t, (v) => (reducedMotion ? 0 : Math.max(0, (1 - v) * 180)));
  const stripOpacity = useTransform([t, pileSlot], ([v, s]) => {
    if ((s as number) > PILE_VISIBLE - 0.5) return 0;
    if (reducedMotion && turning) return forward ? clamp01(p.get()) : 1 - clamp01(p.get());
    return (v as number) >= 0.5 ? 1 : 0;
  });
  // The back of a turning page is plain: its words arrive as it lies flat.
  const stripWords = useTransform(t, (v) => (reducedMotion ? 1 : clamp01((v - 0.5) * 2) ** 2));
  const stripBg = useTransform(pileSlot, (s) => face(0.04 + s * TINT_STEP, hex));
  const stripZ = useTransform([t, pileSlot], ([v, s]) =>
    (v as number) > 0 && (v as number) < 1 ? 40 : 15 - Math.round(s as number),
  );

  // The finger: on the top card it turns the page down; on a strip it turns
  // that page back up. A tap on a strip does the same on the spring. A pan
  // is never a tap, so the link beneath does not fire on release.
  const panned = useRef(false);
  const start = (target: string | null) => (): void => {
    panned.current = true;
    if (target) flip.grab(target);
  };
  const onPan = (_: PointerEvent, info: PanInfo): void => flip.move(info.offset.y);
  const onPanEnd = (_: PointerEvent, info: PanInfo): void => {
    flip.release(info.velocity.y);
    window.setTimeout(() => {
      panned.current = false;
    }, 0);
  };
  const guard = (event: React.MouseEvent): void => {
    if (panned.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const title = card.splash.title.trim() || card.splash.ghostTitle || 'Untitled';
  const onTop = i === n;
  const faceSlot = Math.max(0, i - n);

  return (
    <>
      <motion.div
        data-stack-card={card.splash.id}
        data-slot={i < n ? -1 : faceSlot}
        data-turning={turning ? (forward ? 'down' : 'up') : undefined}
        className="absolute top-0 origin-bottom overflow-hidden rounded-t-[24px]"
        style={{
          left: faceInset,
          right: faceInset,
          y: faceY,
          rotateX: faceRotate,
          opacity: faceOpacity,
          backgroundColor: faceBg,
          // The body's fade sinks into this face's own colour, not white.
          ['--face' as string]: faceBg,
          zIndex: faceZ,
          height: CARD_PX,
          backfaceVisibility: 'hidden',
          pointerEvents: onTop ? 'auto' : 'none',
        }}
        onPanStart={start(ids[n + 1] ?? null)}
        onPan={onPan}
        onPanEnd={onPanEnd}
      >
        <CardFace
          card={card}
          lane={lane}
          initials={initials}
          edge={onTop ? 'full' : 'top'}
          onClickCapture={guard}
        />
      </motion.div>

      <motion.button
        type="button"
        data-pile-strip={card.splash.id}
        data-pile-slot={i < n ? n - 1 - i : undefined}
        aria-label={`Turn ${title} back up`}
        tabIndex={i < n ? 0 : -1}
        className="absolute inset-x-0 top-0 flex origin-top items-center gap-1.5 rounded-lg px-4 text-left text-xs font-medium"
        style={{
          y: stripY,
          rotateX: stripRotate,
          opacity: stripOpacity,
          backgroundColor: stripBg,
          zIndex: stripZ,
          height: STRIP_PX,
          backfaceVisibility: 'hidden',
          pointerEvents: i < n ? 'auto' : 'none',
        }}
        onPanStart={start(card.splash.id)}
        onPan={onPan}
        onPanEnd={onPanEnd}
        onClickCapture={guard}
        onClick={() => i < n && flip.bringForward(card.splash.id)}
      >
        <motion.span
          className="text-ink flex min-w-0 flex-1 items-center gap-1.5"
          style={{ opacity: stripWords }}
        >
          {postIcon(card.splash, lane) ? (
            <span aria-hidden>{postIcon(card.splash, lane)}</span>
          ) : null}
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <span className="text-pool-500 shrink-0 tabular-nums">{cardDate(card.day)}</span>
        </motion.span>
      </motion.button>
    </>
  );
}
