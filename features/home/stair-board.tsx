'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useSpring, useTransform, type MotionValue, type PanInfo } from 'motion/react';

import { useBackdropFrost } from '@/components/ui/use-backdrop-frost';
import { useWide } from '@/components/ui/use-wide';
import { usePrefersReducedMotion } from '@/components/ui/waves/use-reduced-motion';
import type { MyCategory } from '@/lib/queries/profile';

import { useTheme } from '@/features/people/theme-provider';

import { CARD_PX, CardFace, face, SPINE_PX, TINT_STEP } from './card-face';
import { CardMenu } from './card-menu';
import { laneOfCard, type Card, type CardLane } from './grid';
import { FLIP_SPRING, type Flip } from './use-flip';

/** Each step of the lower stair: how far a card peeks below the one in front, its visible edge. */
export const STEP_PX = 26;
/** The one read card above peeks by less: a bookmark, not a second stack (review). */
export const UP_STEP_PX = 22;
/** Each card a step away is this much the size of the one before, about its centre. */
export const STEP_SCALE = 0.94;
/** How many unread cards show below the top, and how many read cards above it: exactly one (review). */
const DOWN = 3;
const UP = 1;
/**
 * The stair runs sideways on a wide screen only while this is true. Off
 * (review, 2026-10-26): with the stack at a third of the width, a wide
 * screen flips it up and down as a phone does, its top card taller with
 * the column's height. The sideways stair stays in the tree behind it.
 */
export const SIDEWAYS = false;

/** Low (the Board view on a phone): a shorter top card and one step, so the board above gets the height (review). */
const LOW_CARD_PX = 128;
const LOW_DOWN = 1;
/** The board's box on a phone: the top card and the lower stair; the upper stair rises above it, into the water. */
export const STACK_PX = CARD_PX + DOWN * STEP_PX;
/** Sideways, the top card is never narrower than this; fewer cards fan to the right before it would be. */
const MIN_CARD_WIDTH_PX = 320;
/**
 * The fills, one family centred on the top card (review): below it each step
 * is another 8% of the water's colour (the theme, 0032) mixed into white. Above it the one read
 * card is **frosted glass** (`.frosted`): white at 20% over a blurred
 * backdrop, or the solid joint surface (`--color-joint`) when blur is unavailable; its words white
 * at 60%.
 */
const DOWN_TINTS = [0, TINT_STEP, TINT_STEP * 2, TINT_STEP * 3] as const;
const UP_ALPHA = 0.2;
const UP_SOLID = [0x37, 0x39, 0xd4] as const;
const UP_INK = 0.6;

/** How far the finger travels before a drag's axis is decided (review). */
export const AXIS_PX = 8;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The stair's geometry: the top card's size and seat, which way the stair runs, how many cards show each way. */
export type Stair = {
  horizontal: boolean;
  width: number;
  height: number;
  /** Sideways: the top card's left edge, past the read card's spine when there is one. */
  left: number;
  down: number;
  up: number;
};

/**
 * Where a card sits `d` steps from the top — negative before it (read),
 * zero on top, positive after it (unread) — as a continuous function, so
 * one spring on the stack's depth moves every card one step at once. A
 * card a step away is smaller about its centre, so its translate makes up
 * the difference and its visible edge stays exactly one step. On a phone
 * the stair runs down the screen; sideways on a wide screen, the read card
 * to the left toward the water and the unread fanning right.
 */
export function seat(
  d: number,
  stair: Stair,
  frostGlass = true,
  /** The theme colour the faces step toward (0032). */
  base = '#0507C9',
): {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  background: string;
  ink: number;
} {
  const steps = Math.abs(d);
  const scale = STEP_SCALE ** steps;
  let x = 0;
  let y = 0;
  if (stair.horizontal) {
    const shrink = (stair.width * (1 - scale)) / 2;
    x = d >= 0 ? SPINE_PX * d + shrink : SPINE_PX * d - shrink;
  } else {
    const shrink = (stair.height * (1 - scale)) / 2;
    y = d >= 0 ? STEP_PX * d + shrink : UP_STEP_PX * d - shrink;
  }
  let opacity: number;
  if (d >= 0) opacity = steps <= stair.down ? 1 : Math.max(0, 1 - (steps - stair.down) * 2);
  else opacity = steps <= stair.up ? 1 : Math.max(0, 1 - (steps - stair.up) * 2);
  if (d >= 0) {
    // The fill, read off the ramp between its two nearest steps.
    const at = Math.min(steps, DOWN_TINTS.length - 1);
    const low = Math.floor(at);
    const tint = lerp(
      DOWN_TINTS[low],
      DOWN_TINTS[Math.min(low + 1, DOWN_TINTS.length - 1)],
      at - low,
    );
    return { x, y, scale, opacity, background: face(tint, base), ink: 1 };
  }
  const rise = Math.min(1, steps);
  const ink = lerp(1, UP_INK, rise);
  if (frostGlass) {
    const alpha = lerp(1, UP_ALPHA, rise);
    return {
      x,
      y,
      scale,
      opacity,
      background: `rgba(255, 255, 255, ${alpha.toFixed(3)})`,
      ink,
    };
  }
  const channel = (white: number, solid: number): number => Math.round(lerp(white, solid, rise));
  return {
    x,
    y,
    scale,
    opacity,
    background: `rgb(${channel(255, UP_SOLID[0])}, ${channel(255, UP_SOLID[1])}, ${channel(255, UP_SOLID[2])})`,
    ink,
  };
}

/**
 * The diving board as a staircase (H22, review): the top card is the
 * current step. Unread cards step down below it, each peeking below the one
 * before by a step, smaller and a shade darker, three at most; the one card
 * read last steps up above it by a shorter step — a bookmark — free to sit
 * over the grid's bottom edge; earlier read cards are reached through their
 * marks. A peeking card shows its lane emoji and title on its visible edge,
 * one line; the top card shows everything.
 *
 * Flip forward: the top card slides up one step into the upper stair, the
 * first unread card rises into its place, every other card shifts a step —
 * one spring on the stack's depth drives all of it. Flip back is the exact
 * reverse. Tap a lower card to bring it to the top (the cards between shift
 * up); tap an upper card to bring it back down (the cards between shift
 * down); swipe up on the top card to flip forward, down to flip back. No
 * chevrons, no strips. Under reduced motion the cards take their seats at
 * once and the old and new top crossfade.
 *
 * **Sideways on a wide screen** (review): the read card to the left of the
 * top card, toward the water, the unread fanning to the right — as many as
 * fit without crossing the right edge. A peeking card is a book spine, 44px
 * wide: the lane emoji at the top, the title written downward. Click brings
 * it to the top with the same motion; the arrow keys flip back and forward
 * when the stack has focus; drag the top card left to flip forward, right
 * to flip back.
 */
export function StairBoard({
  cards,
  flip,
  categories,
  initials,
  pinnedIds,
  onPin,
  onDelete,
  hrefFor,
  low = false,
}: {
  /** Newest first, in the order `flip.ids` follows. */
  cards: Card[];
  flip: Flip;
  categories: Pick<MyCategory, 'id' | 'icon' | 'name'>[];
  initials: string;
  pinnedIds: ReadonlySet<string>;
  onPin: (card: Card, pinned: boolean) => void;
  onDelete: (card: Card) => void;
  /** Where the top card opens; Home's way back by default, a lane page's on a lane page. */
  hrefFor?: (id: string) => string;
  /** On a phone: a shorter card and one step, giving the room above to the Board view. */
  low?: boolean;
}) {
  const { ids, n, next, bringForward } = flip;
  const byId = new Map(cards.map((card) => [card.splash.id, card]));
  const wide = useWide();
  const horizontal = wide && SIDEWAYS;

  // The board measures its room. On a phone the box is the card's own and
  // the stair runs down; on a wide screen the board fills its half, the
  // stair runs sideways, and the top card takes what the spines leave.
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() =>
      setRoom({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  let stair: Stair;
  if (horizontal) {
    const width = room?.width ?? 0;
    const height = room?.height ?? 0;
    // As many right-hand cards as fit before the top card would be too narrow.
    const down = Math.max(
      1,
      Math.min(DOWN, Math.floor((width - SPINE_PX - MIN_CARD_WIDTH_PX) / SPINE_PX)),
    );
    // Only the spines in use take room: with fewer cards behind, or none
    // read, the top card widens into the slots they would have had, so
    // nothing is left empty at either side (review). Measured against where
    // the flip in flight lands, so the width springs along with it.
    const behind = Math.min(down, Math.max(0, ids.length - 1 - next));
    const before = Math.min(UP, next);
    stair = {
      horizontal: true,
      width: Math.max(MIN_CARD_WIDTH_PX, width - SPINE_PX * (before + behind)),
      height: Math.max(CARD_PX, height),
      left: SPINE_PX * before,
      down,
      up: UP,
    };
  } else {
    // Low only on a phone: a wide screen's column has the height to spare.
    const short = low && !wide;
    const down = short ? LOW_DOWN : DOWN;
    stair = {
      horizontal: false,
      width: room?.width ?? 0,
      height: Math.max(short ? LOW_CARD_PX : CARD_PX, (room?.height ?? 0) - down * STEP_PX),
      left: 0,
      down,
      up: UP,
    };
  }
  const stackHeight = horizontal ? stair.height : stair.height + stair.down * STEP_PX;
  // The top card's width and seat move on the spring as cards come and go.
  const cardWidth = useSpring(stair.width, FLIP_SPRING);
  const cardLeft = useSpring(stair.left, FLIP_SPRING);
  useEffect(() => {
    cardWidth.set(stair.width);
    cardLeft.set(stair.left);
  }, [stair.width, stair.left, cardWidth, cardLeft]);

  // The finger on the top card: up (left, sideways) flips forward, down
  // (right) flips back; which is not known until it has moved, so the grab
  // waits for the first move.
  const panned = useRef(false);
  const grabbed = useRef(false);
  const along = (info: PanInfo): { offset: number; velocity: number } =>
    horizontal
      ? { offset: info.offset.x, velocity: info.velocity.x }
      : { offset: info.offset.y, velocity: info.velocity.y };
  const onPanStart = (): void => {
    panned.current = true;
    grabbed.current = false;
    decided.current = null;
  };
  // The axis is decided from the first 8px (review): a drag that starts
  // across the stair is not a flip, and never becomes one mid-gesture.
  const decided = useRef<'along' | 'across' | null>(null);
  const onPan = (_: PointerEvent, info: PanInfo): void => {
    const { offset } = along(info);
    if (decided.current === null) {
      const across = horizontal ? info.offset.y : info.offset.x;
      if (Math.hypot(offset, across) < AXIS_PX) return;
      decided.current = Math.abs(offset) >= Math.abs(across) ? 'along' : 'across';
    }
    if (decided.current === 'across') return;
    if (!grabbed.current) {
      // From where the stack is going, so a swipe during a landing moves
      // on to the next card rather than re-grabbing the one landing.
      const at = Math.max(0, ids.indexOf(flip.heading ?? ''));
      const target = offset < 0 ? ids[at + 1] : ids[at - 1];
      if (!target) return;
      grabbed.current = true;
      flip.grab(target);
    }
    flip.move(offset);
  };
  const onPanEnd = (_: PointerEvent, info: PanInfo): void => {
    if (grabbed.current) flip.release(along(info).velocity);
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
  // The arrow keys, when the stack has focus: left or up back, right or down forward.
  const onKeyDown = (event: React.KeyboardEvent): void => {
    const at = Math.max(0, ids.indexOf(flip.heading ?? ''));
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const target = forward ? ids[at + 1] : back ? ids[at - 1] : null;
    if (!target) return;
    event.preventDefault();
    bringForward(target);
  };

  // Only what can be seen is rendered: the two stairs around the top, at
  // both ends of the motion in flight.
  const first = Math.max(0, Math.min(n, next) - UP);
  const last = Math.min(ids.length - 1, Math.max(n, next) + stair.down);
  const pages: number[] = [];
  for (let i = first; i <= last; i += 1) pages.push(i);

  return (
    <div
      ref={box}
      data-diving-board
      data-board="stair"
      className="relative z-10 shrink-0 px-4 lg:min-h-0 lg:flex-1 lg:px-0"
    >
      {cards.length > 0 ? (
        <div
          data-stack
          data-axis={horizontal ? 'x' : 'y'}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="relative outline-none select-none"
          style={{ height: stackHeight, touchAction: 'none' }}
        >
          {pages.map((i) => {
            const card = byId.get(ids[i]);
            return card ? (
              <Step
                key={card.splash.id}
                card={card}
                index={i}
                flip={flip}
                stair={stair}
                cardWidth={cardWidth}
                cardLeft={cardLeft}
                lane={laneOfCard(card, categories)}
                initials={initials}
                onPanStart={onPanStart}
                onPan={onPan}
                onPanEnd={onPanEnd}
                guard={guard}
                pinned={pinnedIds.has(card.splash.id)}
                onPin={(pinned) => onPin(card, pinned)}
                onDelete={() => onDelete(card)}
                href={hrefFor?.(card.splash.id)}
              />
            ) : null;
          })}
        </div>
      ) : null}
    </div>
  );
}

/** One card on the stair, seated by its distance from the top as the depth moves. */
function Step({
  card,
  index,
  flip,
  stair,
  cardWidth,
  cardLeft,
  lane,
  initials,
  onPanStart,
  onPan,
  onPanEnd,
  guard,
  pinned,
  onPin,
  onDelete,
  href,
}: {
  card: Card;
  index: number;
  flip: Flip;
  stair: Stair;
  cardWidth: MotionValue<number>;
  cardLeft: MotionValue<number>;
  lane: CardLane | null;
  initials: string;
  onPanStart: () => void;
  onPan: (event: PointerEvent, info: PanInfo) => void;
  onPanEnd: (event: PointerEvent, info: PanInfo) => void;
  guard: (event: React.MouseEvent) => void;
  pinned: boolean;
  onPin: (pinned: boolean) => void;
  onDelete: () => void;
  href?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const frostGlass = useBackdropFrost();
  const { p, n, next, bringForward } = flip;
  const i = index;
  const from = i - n;
  const to = i - next;
  const moving = from !== to;
  const { horizontal } = stair;
  // Frost only when the read card is at rest on the upper step; while it
  // moves to or from the top, use the solid fallback so the full face is
  // not read through 20% white.
  const frostFill = frostGlass && !(moving && (from < 0 || to < 0));
  const { hex } = useTheme();

  // The card's distance from the top as the stack's depth moves.
  const d = useTransform(p, (v) => (reducedMotion ? to : lerp(from, to, clamp01(v))));
  const y = useTransform(d, (v) => seat(v, stair, frostFill, hex).y);
  const x = useTransform(d, (v) => seat(v, stair, frostFill, hex).x);
  const scale = useTransform(d, (v) => seat(v, stair, frostFill, hex).scale);
  const opacity = useTransform([d, p], ([v, pv]) => {
    const at = seat(v as number, stair, frostFill, hex).opacity;
    if (!reducedMotion || !moving) return at;
    // Reduced motion: the old top fades out as the new one fades in.
    if (from === 0) return at * (1 - clamp01(pv as number));
    if (to === 0) return at * clamp01(pv as number);
    return at;
  });
  const background = useTransform(d, (v) => seat(v, stair, frostFill, hex).background);
  // A card moving to or from the top carries both faces and crossfades them
  // on its distance from the top, so nothing switches when it lands.
  const fullOpacity = useTransform(d, (v) => 1 - clamp01(Math.abs(v)));
  const edgeOpacity = useTransform(d, (v) => clamp01(Math.abs(v)));
  const inkOpacity = useTransform(d, (v) => seat(v, stair, frostFill, hex).ink);
  // Nearer the top, nearer the eye; a card rising from below over one sliding up.
  const zIndex = useTransform(d, (v) => Math.round((30 - Math.abs(v)) * 10) + (v >= 0 ? 1 : 0));

  const onTop = to === 0;
  const stairSide = to === 0 ? 'top' : to < 0 ? 'up' : 'down';
  // Which stair's edge a card shows when it is not on top: by where it is
  // going, or, moving between two stairs, by where it was.
  const touchesTop = moving && (from === 0 || to === 0);
  const side = touchesTop ? (from < 0 || to < 0 ? 'up' : 'down') : from < 0 ? 'up' : 'down';
  const edgeSide = moving ? side : stairSide === 'up' ? 'up' : 'down';
  const frosted = frostFill && stairSide === 'up';
  const title = card.splash.title.trim() || card.splash.ghostTitle || 'Untitled';
  const edge = horizontal
    ? edgeSide === 'up'
      ? 'left'
      : 'right'
    : edgeSide === 'up'
      ? 'top'
      : 'bottom';

  return (
    <motion.div
      data-stack-card={card.splash.id}
      data-slot={from}
      data-stair={stairSide}
      data-step={Math.abs(to)}
      data-moving={moving ? (to < from ? 'up' : 'down') : undefined}
      className={`absolute top-0 origin-center ${horizontal ? '' : 'inset-x-0'}`}
      style={{
        x,
        y,
        scale,
        opacity,
        zIndex,
        height: stair.height,
        ...(horizontal ? { left: cardLeft, width: cardWidth } : {}),
      }}
      // The finger's handlers stay on the card it went down on: the card at
      // rest on top (`from`), not the card heading there (`to`). Keyed on
      // `to`, a grab moved them to the incoming card mid-gesture, the
      // release never arrived and the stack stayed stuck in flight — every
      // tap and swipe after the first went dead (review, touch).
      onPanStart={from === 0 ? onPanStart : undefined}
      onPan={from === 0 ? onPan : undefined}
      onPanEnd={from === 0 ? onPanEnd : undefined}
    >
      {/* The face, clipped to the card's corners so the frost stays inside. */}
      <motion.div
        className={`absolute inset-0 overflow-hidden rounded-[24px] ${frosted ? 'frosted' : ''}`}
        style={{
          background,
          ['--face' as string]: background,
          ['--ink-opacity' as string]: inkOpacity,
        }}
      >
        {onTop || touchesTop ? (
          <motion.div
            className="absolute inset-0"
            style={{ opacity: touchesTop ? fullOpacity : 1 }}
          >
            <CardFace
              card={card}
              lane={lane}
              initials={initials}
              edge="full"
              href={href}
              onClickCapture={guard}
            />
            {onTop && !moving ? (
              <CardMenu card={card} pinned={pinned} onPin={onPin} onDelete={onDelete} />
            ) : null}
          </motion.div>
        ) : null}
        {!onTop || touchesTop ? (
          <motion.div
            className="absolute inset-0"
            style={{ opacity: touchesTop ? edgeOpacity : 1 }}
          >
            {/* A step: its visible edge is a seat, one tap to the top. Sideways
                the whole face is, the cards in front covering the rest. */}
            {/* Live while cards move, too: a tap during a landing moves on
                rather than waiting it out (review). */}
            {stairSide !== 'top' ? (
              <button
                type="button"
                data-step-card={card.splash.id}
                aria-label={`Bring ${title} to the top`}
                // On a phone the lower bands are too thin to aim at (review):
                // a tap anywhere in the lower stair brings up the next card.
                // Sideways, each spine is wide enough to be its own target.
                onClick={() =>
                  bringForward(
                    !horizontal && stairSide === 'down'
                      ? (flip.ids[Math.max(0, flip.ids.indexOf(flip.heading ?? '')) + 1] ??
                          card.splash.id)
                      : card.splash.id,
                  )
                }
                className={`absolute z-10 cursor-pointer ${
                  horizontal ? 'inset-0' : `inset-x-0 ${stairSide === 'up' ? 'top-0' : 'bottom-0'}`
                }`}
                style={
                  horizontal ? undefined : { height: stairSide === 'up' ? UP_STEP_PX : STEP_PX }
                }
              />
            ) : null}
            <CardFace
              card={card}
              lane={lane}
              initials={initials}
              edge={edge}
              ink={edgeSide === 'up' ? 'white' : 'blue'}
            />
          </motion.div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
