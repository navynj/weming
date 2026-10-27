import { monthKey, representativeLane, type SplashSummary } from '@/features/splash/summary';
import type { BoardLayoutJson, LayoutSource } from '@/features/month-board/board-layout';
import type { RippleResponsesValue } from '@/features/responses/model';
import type { MyCategory } from '@/lib/queries/profile';
import type { IsoDate } from '@/lib/time';

/**
 * At most this many lanes show at once (round 3): with this many or fewer
 * the columns share the width evenly; with more, each column keeps this
 * share of the width and the columns scroll sideways under the fixed date
 * rail. Every mark carries its short title beneath it either way.
 */
export const EVEN_COLUMNS_MAX = 6;
export const FIXED_COLUMN_PX = 56;

/** The grid's one unit: a post as a card on the diving board and a mark on the grid. */
export type Card = {
  splash: SplashSummary;
  /** The day row the mark sits on: the last day of the post's range, else the day it was made (H22). */
  day: IsoDate;
  /** Order within the day: its latest block that day, else the day's end. */
  instant: number;
  /** Every block's words, oldest first, as one text: the pinned card's excerpt. */
  body: string;
  /** Every block with words, oldest first: the card's thread, one entry per ripple. */
  ripples: CardRipple[];
  /**
   * In a pool (H23), where the mark sits — the pool lane in the Lane view,
   * the author in Swimmers — and what the card names as its lane. Absent on
   * Home, where both come from the post's own lane.
   */
  column?: string;
  lane?: CardLane | null;
  /** In a pool: the author's initials, under the mark's title and on the card. */
  author?: string;
  /** In a pool: whose it is, for their face (0018). */
  authorId?: string;
  /** In a pool: their name, written out under the mark and on the row (review). */
  authorName?: string;
  /** A joint splash (H23), wherever it is drawn: its mark and its row are a pill, not a disc (review). */
  joint?: boolean;
  /**
   * Invited (0033): Everyone on, or anyone besides its maker picked — the
   * filled background, on the Calendar's label and the List's row. A joint
   * record with nobody picked and Everyone off stays unfilled, as any record.
   */
  together?: boolean;
  /** My record on Home: its members' ripples, a count per pool (0035): "JY · 3 · SY · 2". */
  sides?: { label: string; count: number }[];
  /**
   * On Home, my side on someone else's record (0035): drawn with the pale fill
   * a period band has and its pool's face, never a fill of my choosing (review).
   */
  side?: boolean;
  /**
   * In a pool's Calendar, Lane and List (review): its author's face after the
   * title — on every record that is not joint, mine included. Never on Home;
   * never in Swimmers, whose column says who.
   */
  authorFace?: boolean;
  /**
   * In a pool, with Everyone (review): a joint record with Everyone on, or a
   * member's own record shared here with Everyone on. In Swimmers, drawn with
   * pieces, it spans every column as a band.
   */
  everyone?: boolean;
  /** A joint splash (H23): drawn as a band across the columns, each ripple a branch. */
  branches?: Branch[];
  /** On Home: the pools this post is shared to, as monogram chips. */
  pools?: string[];
  /** On Home: the photo of the pool a joint splash belongs to (0024), drawn in its monogram's place. */
  poolPhoto?: string | null;
  /** On Home, my record: every pool it is shared to now, each its monogram or photo (review). */
  sharedPools?: { name: string; photo: string | null }[];
  /**
   * Its calendar layout, set by hand (0025): only the fields someone set,
   * drawn over the automatic recipe; where it comes from ('pool' or 'home');
   * and on Home, its pool's layout, which "Use pool layout" goes back to.
   */
  layout?: BoardLayoutJson;
  layoutSource?: LayoutSource;
  poolLayout?: BoardLayoutJson | null;
  /**
   * Its Lane view layout (0045), kept apart from the Calendar's above: the
   * same three, for the Lane view's drafts to read as theirs.
   */
  laneLayout?: {
    layout?: BoardLayoutJson;
    layoutSource?: LayoutSource;
    poolLayout?: BoardLayoutJson | null;
  };
  /** In a pool, its Swimmers layout (0047): the same three, apart from both above. */
  swimmersLayout?: {
    layout?: BoardLayoutJson;
    layoutSource?: LayoutSource;
    poolLayout?: BoardLayoutJson | null;
  };
  /** Where it is or was in a pool (0015): "<Pool> · <emoji> <pool lane>", one per pool. */
  origins?: string[];
  /** Where the top card opens, when not the post's own page from Home. */
  href?: string;
  /** What the top card's menu offers; both when absent. In a pool, only what is mine to do. */
  menu?: { pin: boolean; delete: boolean };
  /**
   * The pencil beside the menu (review): my own splash, or a joint splash in
   * a pool I am in. Absent: no pencil.
   */
  editable?: boolean;
  /** Every image across its ripples, oldest first, for the Board view: each with the ripple it is on. */
  photos?: CardPhoto[];
  /** A joint splash (Board view): who has written on it, once each, in the order they first wrote. */
  writers?: CardFace[];
  /** A joint splash (Board view): the current members who have not written on it yet. */
  awaiting?: CardFace[];
  /**
   * What readers left on its ripples, for the top card (H25): present only
   * where someone besides me can see the post, with my ripples that are
   * locked and so take nothing. The calendar board shows none of it.
   */
  responded?: { value: RippleResponsesValue; locked: string[] };
  /** The newest reaction or reply someone else left on each ripple of mine on it: the unseen dot (H25). */
  respondedAt?: Record<string, string>;
};

/** A person as a face on the board: their id finds their photo; the initials stand in. */
export type CardFace = { authorId: string; initials: string };

/** One image of a post's, and the ripple it hangs on (whose visibility signs it). */
export type CardPhoto = { rippleId: string; path: string };

/** A ripple as a card reads it: its words, when it was written, and in a pool whose it is. */
export type CardRipple = {
  id: string;
  note: string;
  createdAt: string;
  initials?: string;
  /** In a pool: whose it is, for their face (0018). */
  authorId?: string;
  /** In a pool: their name, written out in labels (review). */
  authorName?: string;
};

/** What a card names as its lane: an emoji and a name. */
export type CardLane = { icon: string | null; name: string };

/**
 * A joint splash's surface — its band and its Date-view pill: white at 20%
 * over the water, as one solid colour (review). Solid, so the faces stacked
 * on it can wear a ring of the same colour that separates them unseen; over
 * a translucent fill that ring showed as a line.
 */
export const JOINT_SURFACE = 'var(--color-joint)';

/** A joint splash's ripple, as a branch off its band: the column it drops into, and whose it is. */
export type Branch = { id: string; column: string; initials: string; authorId?: string };

/** A column of the grid: a lane of mine on Home, a pool lane or a member in a pool. */
export type GridColumn = {
  id: string;
  name: string;
  icon: string | null;
  /** A member's column shows their initials on a disc instead of an emoji. */
  avatar?: string;
  /**
   * A pool's column on Home (0014): its monogram tile instead of an emoji —
   * the pool's name, or '' for a neutral tile (a pool I left).
   */
  monogram?: string;
  /** That pool's photo (0024), in the monogram's place; none for a pool I left. */
  photo?: string | null;
  /** Where the header goes: a lane's page on Home; null for no link. */
  href?: string | null;
};

/**
 * Where a post sits (H22): on the last day of its range, else the day it
 * was made — one row, one month, no longer every month its range touches.
 * Within the day it orders by its latest block (H24: by when it was
 * written; a block's own date places nothing), else by when it last
 * received something, so the grid and the stack read the same key.
 */
export function placeCard(
  splash: SplashSummary,
  body: string,
  timeZone: string,
  ripples: CardRipple[] = body
    ? [{ id: splash.id, note: body, createdAt: splash.latestCreatedAt }]
    : [],
): Card {
  // The author's own day, stored (0013): no reader's zone moves the row.
  const day = splash.range?.end ?? splash.writtenOn;
  const onDay = splash.blocks.filter((block) => block.day === day);
  const instant =
    onDay.length > 0 ? onDay[onDay.length - 1].instant : Date.parse(splash.latestCreatedAt);
  return { splash, day, instant, body, ripples };
}

/** Newest first: the later day, then the later moment, then the later-made post. */
export function byNewest(a: Card, b: Card): number {
  return (
    b.day.localeCompare(a.day) ||
    b.instant - a.instant ||
    b.splash.createdAt.localeCompare(a.splash.createdAt)
  );
}

/** The glyph a post shows as (0008): its own icon when set, else its lane's emoji. */
export function postIcon(
  splash: Pick<SplashSummary, 'icon'>,
  lane: Pick<CardLane, 'icon'> | null,
): string | null {
  return splash.icon ?? lane?.icon ?? null;
}

/** The lane a post's mark sits under: its own (H24), else a lone block's. */
export function cardLane(splash: SplashSummary): string | null {
  return splash.declaredLaneId ?? representativeLane(splash);
}

/** Home's column for my pool records and joint records in one pool (0014, 0033). */
export function ownPoolColumn(poolId: string): string {
  return `pool:${poolId}`;
}

/**
 * My ripple on a joint splash of a pool I left (0041): shown alone, in that
 * pool's column, never laneless (H24 release 2 leaves it no lane of its own).
 */
export function inLeftPool(card: Card, poolId: string): Card {
  return { ...card, column: ownPoolColumn(poolId), lane: { icon: null, name: 'A pool you left' } };
}

/** The column a mark sits in: the pool's choice where there is one (H23), else its lane. */
export function cardColumn(card: Card): string | null {
  if (card.column) return card.column;
  // My pool record: no lane of mine, so its pool's column on Home (0014).
  if (card.splash.ownPoolId) return ownPoolColumn(card.splash.ownPoolId);
  return cardLane(card.splash);
}

/** What a card names as its lane: its own (a pool lane), else one of mine. */
export function laneOfCard(
  card: Card,
  categories: Pick<MyCategory, 'id' | 'icon' | 'name'>[],
): CardLane | null {
  if (card.lane !== undefined) return card.lane;
  const id = cardLane(card.splash);
  return categories.find((c) => c.id === id) ?? null;
}

/** True when the post's column is none of the grid's: it takes the unlabelled column. */
export function isOrphanCard(card: Card, columns: Pick<GridColumn, 'id'>[]): boolean {
  const column = cardColumn(card);
  return column === null || !columns.some((c) => c.id === column);
}

/** `2026-10-21`, the day before. */
export function dayBefore(day: IsoDate): IsoDate {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

/** Every day from `from` down to `to` inclusive, newest first. */
export function daysDown(from: IsoDate, to: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let day = from; day >= to; day = dayBefore(day)) days.push(day);
  return days;
}

/** The first day of the month a day falls in. */
export function monthStart(day: IsoDate): IsoDate {
  return `${monthKey(day)}-01`;
}

/**
 * The grid's top row: today, or a later day a post reaches into. Its floor:
 * the first day of the oldest post's month, or of today's month with nothing
 * written — the grid never asks for a day before anything was written.
 */
export function gridBounds(cards: Card[], today: IsoDate): { top: IsoDate; floor: IsoDate } {
  let top = today;
  let oldest = today;
  for (const card of cards) {
    if (card.day > top) top = card.day;
    if (card.day < oldest) oldest = card.day;
  }
  return { top, floor: monthStart(oldest) };
}

/** `WED`, for a day row. */
export function weekdayOf(day: IsoDate): string {
  return new Date(`${day}T00:00:00Z`)
    .toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
    .toUpperCase();
}

/** `OCT`, for the rail's month label. */
export function monthAbbrev(day: IsoDate): string {
  return new Date(`${day}T00:00:00Z`)
    .toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    .toUpperCase();
}

/** `Oct 22 (THU)`, as the card heads itself. */
export function cardDate(day: IsoDate): string {
  const at = new Date(`${day}T00:00:00Z`);
  return `${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} (${weekdayOf(day)})`;
}

/**
 * `YL` from `Yoonji Lee`: the first letter of the first two words, or the
 * first two letters of a lone word. Grapheme-aware, so a Korean name keeps
 * its syllables whole.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const graphemes = (word: string): string[] =>
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word)].map(
          (s) => s.segment,
        )
      : [...word];
  if (words.length === 0) return '';
  if (words.length === 1) return graphemes(words[0]).slice(0, 2).join('').toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => graphemes(word)[0] ?? '')
    .join('')
    .toUpperCase();
}

/** The newest card of a month, for `?m=`: the ground opens with it on top. */
export function newestIn(cards: Card[], month: string): Card | null {
  return cards.find((card) => monthKey(card.day) === month) ?? null;
}

/**
 * Cards with the edits made a moment ago laid over them (review): the title,
 * icon and declared lane show at once, before the re-read lands.
 */
export function withEdits(
  cards: Card[],
  edits: Record<
    string,
    {
      title: string;
      icon: string | null;
      declaredLaneId?: string | null;
      poolLane?: { id: string; icon: string | null; name: string };
      kind?: 'mine' | 'own' | 'joint';
    }
  >,
): Card[] {
  if (Object.keys(edits).length === 0) return cards;
  return cards.map((card) => {
    const edit = edits[card.splash.id];
    if (!edit) return card;
    return {
      ...card,
      splash: {
        ...card.splash,
        title: edit.title,
        icon: edit.icon,
        ...(edit.declaredLaneId !== undefined ? { declaredLaneId: edit.declaredLaneId } : {}),
        ...(edit.kind === 'mine' ? { ownPoolId: null } : {}),
      },
      // Moved to another pool lane (0020): where a mark in its pool's column
      // on Home borrows the pool lane's emoji, it borrows the new one at once.
      ...(edit.poolLane && card.lane && cardColumn(card)?.startsWith('pool:')
        ? { lane: { ...card.lane, icon: edit.poolLane.icon } }
        : {}),
      // Made mine (0022): on Home it leaves its pool's column and badge for
      // the lane it now declares.
      ...(edit.kind === 'mine' && !card.branches
        ? {
            column: undefined,
            lane: undefined,
            pools: undefined,
            joint: false,
            href: undefined,
            menu: undefined,
            editable: true,
          }
        : {}),
    };
  });
}
