import type { Card } from '@/features/home/grid';
import { monthKey } from '@/features/splash/summary';
import type { IsoDate } from '@/lib/time';

import { seedOf } from './layout-seed';
import { spreadPhotos } from './photo-spread';

export { seedOf };

/**
 * The calendar's geometry (Calendar view), in logical pixels, laid out at
 * its room's own width and never scaled or panned (review): seven lanes
 * always fit.
 *
 * Composed and lively, always readable (review, the mockup's Sat 3): every
 * item is one of three recipes —
 * - A, inside icon, shifted label (Hoppers): the icon small before the
 *   words; the label starts 35–45% into its lane and keeps the lane's
 *   width, overhanging into the next — only where that lane is empty at
 *   its height, else it starts at 15% and ends at the line;
 * - B, outside sticker, flush label (Lynn Canyon): the label the lane
 *   wide from its line, a large sticker centred on its top-left corner;
 * - C, photo (Beef Short Rib), whenever there are photos: a card 55–70% of
 *   the lane, left or right, tucked 10px up into the item above's bottom
 *   padding, the caption centred under it.
 * A or B by the id, never the same twice in a row within a day, and a day
 * of two or more items has a B. Items stack in time order with no gap; the
 * only overlaps are B's sticker and C's tuck, both into padding or empty
 * water, never words. Labels hug their content.
 */
export const COLUMNS = 7;
/** The first column's weekday: 0 is Sunday. */
export const WEEK_START = 0;
/**
 * A week's column header: the weekday over the day number, centred, and
 * the day's waves beneath — one per record, three at most.
 */
export const HEADER_PX = 96;
/** A month's column header carries only the weekday names. */
export const MONTH_HEADER_PX = 28;
/** A month cell's day number, at the top of the cell (no waves in a month, review): nothing is placed over it. */
export const DAY_NUMBER_PX = 28;
/** How many waves a day shows at most. */
export const DAY_WAVES_MAX = 3;
const FOOT_PX = 24;

/** The three recipes. */
export type Recipe = 'A' | 'B' | 'C';
/** B's sticker sizes: never the same twice in a row within a day; big once a day at most, in a day of two or more. */
export type StickerSize = 'small' | 'medium' | 'big';
/** Where B's sticker sits: on the label's top-left corner (a filled label), or left of its first line. */
export type StickerAt = 'corner' | 'left';
/** On a phone a label may run across this many empty lanes to its right (review). */
const PHONE_SPAN_MAX = 2;
/** A's start, as a share of the lane: overhanging, or its fallback, ending at the line. */
const A_START_MIN = 0.35;
const A_START_MAX = 0.45;
const A_FALLBACK = 0.15;
/** C's card, as a share of the lane, and how far it tucks up into the item above. */
const C_MIN = 0.55;
const C_MAX = 0.7;
export const C_TUCK_PX = 10;
/** Words wrap to three lines at most. */
const CAPTION_LINES = 3;
/** At a hand-set size this large or larger, words wrap to a fourth line before the ellipsis (review). */
const FOUR_LINES_FROM_PX = 14;
/** The board's base type on a phone and on a desktop: a hand-set size is scaled by their ratio on a phone. */
const BASE_PX = { narrow: 10, wide: 10 } as const;
/** No hand-set size draws under the app's floor (CLAUDE.md: the smallest type is 10px). */
const FLOOR_PX = 10;
/** About how wide one 10px Poppins character is, for the line estimate: generous, so words never outgrow their box. */
const CHAR_EM = 0.62;
/**
 * An open joint splash's slot, a row (review): 6px at the sides and 3 above
 * and below inside a 1.5px dashed outline, the faces first — 16px, overlapping by 4 — then a 4px gap, then
 * "Add your side" ("Add" on a phone) at 10px. Drawn at its content's own
 * width; the layout places it by a generous estimate of that width, which
 * the drawn note never exceeds.
 */
export const SLOT_FACE_PX = 16;
const SLOT_FACE_OVERLAP = 4;
const SLOT_GAP_PX = 4;
export const SLOT_PAD_PX = 6;
export const SLOT_PAD_Y_PX = 3;
const SLOT_BORDER_PX = 1.5;
export const SLOT_PX = SLOT_FACE_PX + SLOT_PAD_Y_PX * 2 + SLOT_BORDER_PX * 2;
const SLOT_TILT_MIN = 3;
const SLOT_TILT_MAX = 6;
/** The words' width, estimated generously (0.62em a character at 10px). */
const SLOT_WORDS = { wide: 'Add your side', narrow: 'Add' } as const;
/** A range band's height, the gap between bands, and the lanes bands pack into. */
export const TAPE_PX = 24;
const TAPE_GAP_PX = 2;

/** At most this many photo cards; past it the top card carries "+N". */
export const PHOTOS_SHOWN = 3;
/** The small icon leads the words (A, C). */
const ICON_CHARS = 2;
/** Room the joint faces take after a caption, in characters. */
const FACES_CHARS = 4;

/**
 * A label's background (review): none — white words on the water — for
 * every splash but a joint one; a joint splash — the pool's own (owner
 * none, a pool set), however many ripples or authors it has — white or
 * ink, alternating within a day, wherever it is drawn.
 */
/** `pale`: my side on someone else's record (review), a period band's fill; never chosen. */
export type LabelStyle = 'none' | 'white' | 'ink' | 'pale';
export const LABEL_STYLES: readonly LabelStyle[] = ['none', 'white', 'ink'];

/** The sizes that follow the board's width. */
export type BoardMetrics = {
  width: number;
  /** How many columns: a week's seven days, or the Lane view's lanes. */
  columns: number;
  column: number;
  /** A phone's lanes (under 80px): side padding halved, so words keep some room. */
  narrow: boolean;
  /**
   * A month row's least height: a week with no records keeps its day
   * numbers and their padding, nothing more (review). A busy day grows its
   * whole row; a week row has none.
   */
  rowBase: number;
  /** The caption's type: every title 10px (review). */
  caption: { size: number; line: number; lines: number };
  /** B's stickers, by size (review): 1.6, 2.2 and 3 line heights. */
  stickers: Record<StickerSize, number>;
  /**
   * A label's padding (review): even — a filled label 6 above and below, 8
   * at each side (6 on a phone); one with no fill — no visible box — 4
   * above and below, so its padding makes no gaps. A sticker from
   * the next lane overhangs the line by at most the right padding, onto
   * padding only.
   */
  pad: {
    side: number;
    right: number;
    filled: { top: number; bottom: number };
    none: { top: number; bottom: number };
  };
  /** Each photo card behind the top one peeks this much above the one before. */
  fanMin: number;
  fanMax: number;
};

/** The metrics at a width. */
export function boardMetrics(width: number, columns: number = COLUMNS): BoardMetrics {
  const w = Math.max(columns * 40, Math.round(width));
  const column = w / columns;
  const narrow = column < 80;
  const size = 10;
  const line = size + 3;
  return {
    width: w,
    columns,
    column,
    narrow,
    rowBase: narrow ? 40 : 48,
    caption: { size, line, lines: CAPTION_LINES },
    stickers: {
      small: Math.round(line * 1.6),
      medium: Math.round(line * 2.2),
      big: Math.round(line * 3),
    },
    pad: {
      side: narrow ? 6 : 8,
      right: narrow ? 6 : 8,
      filled: { top: 6, bottom: 6 },
      none: { top: 4, bottom: 4 },
    },
    fanMin: narrow ? 3 : 4,
    fanMax: narrow ? 5 : 8,
  };
}

/** A day of the board: its place, whether it is the month's own (every day of a week is), and how many records it holds. */
export type BoardCell = {
  day: IsoDate;
  /** What the cell holds: its day on the Calendar; its day and lane in the Lane view. */
  key: string;
  inMonth: boolean;
  col: number;
  x: number;
  count: number;
};

/** A cell to lay out: the key its cards are placed by, and the day it is. */
export type CellSpec = { key: string; day: IsoDate };

export type BoardWeek = { index: number; y: number; h: number; cells: BoardCell[] };

/** A box, within a piece or on the board. */
export type Box = { x: number; y: number; w: number; h: number };

/** A post placed on its day (written_on, or its one declared day). */
export type BoardPiece = {
  id: string;
  card: Card;
  day: IsoDate;
  week: number;
  col: number;
  recipe: Recipe;
  /** Photos (C), else a label (A or B). */
  variant: 'photo' | 'sticker';
  label: LabelStyle;
  /** A day of the month before or after, shown in a month's first or last row: drawn at half strength. */
  muted: boolean;
  /** Its words' type: the board's, or the size a person set (review). */
  type: { size: number; line: number; lines: number };
  /** The label runs past the lane's right line, into empty bands of the lanes beside it. */
  overhang: boolean;
  /** How many whole lanes past its own the label reaches (a phone's labels, up to two). */
  span: number;
  /** B's sticker: its size, and where it sits. */
  stickerSize: StickerSize | null;
  stickerAt: StickerAt | null;
  /** A corner sticker's room on the first line only: the words start this far in there (text-indent). */
  indent: number;
  /** C tucks up into the item above's bottom padding. */
  tuck: number;
  /** The photo cards, back to front: the newest of the shown ones on top. */
  fan: PhotoCard[];
  /** Photos beyond those shown: the top card's "+N". */
  morePhotos: number;
  /** Within the piece: the label, its words (the first line apart when it is indented), the photo area, B's sticker. */
  labelBox: Box;
  textBoxes: Box[];
  photoBox: Box | null;
  stickerBox: Box | null;
  /**
   * An open joint splash's slot (review): a dashed note stuck on the
   * label's bottom-right corner — or bottom-left, where the next lane is
   * taken — overlapping the label by its bottom padding, tilted on the
   * corner it hangs from so it never rises into the words. `slotBox` is
   * its box before the tilt, `slotBounds` all it covers after.
   */
  slot: boolean;
  slotBox: Box | null;
  slotBounds: Box | null;
  slotAt: 'right' | 'left' | null;
  slotRotate: number;
  /** The label's padding, as drawn; `center` for C's caption. */
  pad: { top: number; right: number; bottom: number; left: number };
  center: boolean;
  /** The small icon before the words (A, C), or B's sticker. */
  inlineIcon: boolean;
  captionLines: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** One photo card of a fan, placed within its piece's photo area (whose bottom it sits on). */
export type PhotoCard = {
  path: string;
  rippleId: string;
  /** Its width as laid out: the recipe's, or a share of the lane set by hand (review). */
  size: number;
  /** Its box before its tilt, within the photo area: its own ratio, never cropped (photo-spread.ts). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The pile's own tilt, in degrees, unless one is set by hand. */
  tilt: number;
};

/** A ranged post: one band per week row it touches, at the top of the row. */
export type BoardTape = Box & {
  key: string;
  id: string;
  card: Card;
  week: number;
  startCol: number;
  endCol: number;
  /** The range begins in this row. Else it runs in from the row before. */
  startsHere: boolean;
  /** The range ends in this row. Else it runs on into the next. */
  endsHere: boolean;
  /** Only over days of the month before or after: drawn at half strength. */
  muted: boolean;
  /** Its words' size: the board's, or a text size set by hand, the band growing with it (review). */
  size: number;
};

export type BoardLayout = {
  span: 'week' | 'month';
  metrics: BoardMetrics;
  /** `YYYY-MM` for a month; the first day for a week. */
  key: string;
  title: string;
  /** The column headers: the weekday and the day's number. */
  headers: { day: IsoDate; number: number; weekday: string }[];
  width: number;
  height: number;
  weeks: BoardWeek[];
  pieces: BoardPiece[];
  tapes: BoardTape[];
};

/** A second, independent draw from the same id. */
function draw(id: string, salt: string, buckets: number): number {
  return seedOf(`${salt}:${id}`) % buckets;
}

/** A joint splash still waiting on a current member: its label carries the open slot (meaning is shape). */
export function isOpenJoint(card: Card): boolean {
  return (card.joint === true || card.together === true) && (card.awaiting?.length ?? 0) > 0;
}

export function captionOf(card: Card): string {
  return card.splash.title.trim() || card.splash.ghostTitle || 'Untitled';
}

/** A ranged post's days, when it spans more than one. */
function spanOf(card: Card): { start: IsoDate; end: IsoDate } | null {
  const range = card.splash.range;
  return range && range.start < range.end ? range : null;
}

export function addDays(day: IsoDate, n: number): IsoDate {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + n);
  return at.toISOString().slice(0, 10);
}

function weekdayIndex(day: IsoDate): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** `2026 OCT`. */
export function boardTitle(month: string): string {
  const name = new Date(`${month}-01T00:00:00Z`)
    .toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    .toUpperCase();
  return `${month.slice(0, 4)} ${name}`;
}

/** `Oct 19 – 25`, or `Oct 26 – Nov 1` across a month. */
export function weekTitle(start: IsoDate, weekStart: number = WEEK_START): string {
  const first = weekOf(start, weekStart);
  const last = addDays(first, COLUMNS - 1);
  const short = (day: IsoDate): string =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const number = (day: IsoDate): number => Number(day.slice(8));
  return monthKey(first) === monthKey(last)
    ? `${short(first)} ${number(first)} – ${number(last)}`
    : `${short(first)} ${number(first)} – ${short(last)} ${number(last)}`;
}

/** The month before or after `month`. */
export function shiftMonth(month: string, by: number): string {
  const at = new Date(`${month}-01T00:00:00Z`);
  at.setUTCMonth(at.getUTCMonth() + by);
  return at.toISOString().slice(0, 7);
}

/** The first day of the week holding `day`. */
export function weekOf(day: IsoDate, weekStart: number = WEEK_START): IsoDate {
  return addDays(day, -((weekdayIndex(day) - weekStart + 7) % 7));
}

/** The days on a month's board: whole weeks from the one holding the 1st to the one holding the last. */
function monthDays(month: string, weekStart: number): IsoDate[][] {
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  let day = weekOf(`${month}-01`, weekStart);
  const weeks: IsoDate[][] = [];
  while (day <= last) {
    const week: IsoDate[] = [];
    for (let i = 0; i < COLUMNS; i += 1) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** A draw in [0, 1). */
function unit(id: string, salt: string): number {
  return seedOf(`${salt}:${id}`) / 0x100000000;
}

/** A piece's box moved onto the board. */
export function onBoard(piece: Pick<BoardPiece, 'x' | 'y'>, box: Box): Box {
  return { x: piece.x + box.x, y: piece.y + box.y, w: box.w, h: box.h };
}

/** True when two boxes share any area (touching edges do not). */
/**
 * Boxes that meet within this much only touch: lane edges are fractions of
 * the board's width, and a box measured back from one can land a float past it.
 */
const TOUCH_PX = 1e-6;

export function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w - TOUCH_PX &&
    b.x < a.x + a.w - TOUCH_PX &&
    a.y < b.y + b.h - TOUCH_PX &&
    b.y < a.y + a.h - TOUCH_PX
  );
}

/** Everything a piece draws on the board: its label, its photos, its sticker. */
export function extentOf(piece: BoardPiece): Box[] {
  return [piece.labelBox, piece.photoBox, piece.stickerBox, piece.slotBounds]
    .filter((box): box is Box => box !== null)
    .map((box) => onBoard(piece, box));
}

/**
 * A piece's own metrics: the board's, with the type a person set for its
 * label (review) — 10–18px, scaled on a phone by the board's base ratio,
 * never under 10 — its line, its stickers and how many lines it wraps to.
 */
function metricsFor(m: BoardMetrics, fontSize: number | undefined): BoardMetrics {
  if (fontSize === undefined) return m;
  const ratio = m.narrow ? BASE_PX.narrow / BASE_PX.wide : 1;
  const size = Math.max(FLOOR_PX, Math.round(fontSize * ratio));
  const line = size + 3;
  return {
    ...m,
    caption: { size, line, lines: size >= FOUR_LINES_FROM_PX ? 4 : CAPTION_LINES },
    stickers: {
      small: Math.round(line * 1.6),
      medium: Math.round(line * 2.2),
      big: Math.round(line * 3),
    },
  };
}

/** What a day decides for each of its items before they are shaped. */
type Plan = { recipe: Recipe; label: LabelStyle; size: StickerSize | null };

/**
 * A day's plan (review): photos take C; the rest A or B by the id, never
 * the same as the item above's (two photos in a row are both C, there
 * being no other way to draw them); a day of two or more items has a B —
 * an A turned, which can sit by no B, A never following A. B's stickers
 * take a size by the id, never the size of the day's B before, big at
 * most once and only in a day of two or more. A record with invitees
 * (together, 0033) alternates white and ink with the day's other such ones;
 * everything else takes no fill. Its fill set by hand, white or ink, is the
 * person's; a label with no fill stays so.
 */
function planDay(cards: Card[]): Plan[] {
  let fill: LabelStyle | null = null;
  const recipes: Recipe[] = [];
  cards.forEach((card, at) => {
    if ((card.photos?.length ?? 0) > 0) {
      recipes.push('C');
      return;
    }
    // Set by hand (review): Inline is A's icon, off is B's sticker; the rules step aside.
    const inline = card.layout?.icon?.inline;
    if (inline !== undefined) {
      recipes.push(inline ? 'A' : 'B');
      return;
    }
    const drawn: Recipe = draw(card.splash.id, 'recipe', 2) === 0 ? 'A' : 'B';
    const above = recipes[at - 1];
    recipes.push(drawn === above ? (drawn === 'A' ? 'B' : 'A') : drawn);
  });
  if (cards.length >= 2 && !recipes.includes('B')) {
    const at = recipes.findIndex(
      (r, i) => r === 'A' && cards[i].layout?.icon?.inline === undefined,
    );
    if (at >= 0) recipes[at] = 'B';
  }
  let lastSize: StickerSize | null = null;
  let bigUsed = false;
  return cards.map((card, at) => {
    let label: LabelStyle = 'none';
    // My side on someone's record (review): pale, as a period band; not mine to colour.
    if (card.side) label = 'pale';
    else if (card.together) {
      const drawnFill: LabelStyle = draw(card.splash.id, 'label', 2) === 0 ? 'white' : 'ink';
      // A fill set by hand (0027) is drawn as set; the next joint one alternates from it.
      fill =
        card.layout?.label?.style ??
        (drawnFill === fill ? (fill === 'white' ? 'ink' : 'white') : drawnFill);
      label = fill;
    }
    let size: StickerSize | null = null;
    if (recipes[at] === 'B') {
      const sizes = (['small', 'medium', 'big'] as const).filter(
        (s) => s !== lastSize && (s !== 'big' || (!bigUsed && cards.length >= 2)),
      );
      size = sizes[draw(card.splash.id, 'size', sizes.length)];
      if (size === 'big') bigUsed = true;
      lastSize = size;
    }
    return { recipe: recipes[at], label, size };
  });
}

/** The words' measured lines, by piece, the room they had and the first line's indent: the browser's own wrapping. */
export type Measured = Record<string, number>;

/**
 * Photos are never cropped (review, 2026-10-27): each keeps its own ratio,
 * width over height, learned in the browser (photo-aspects.ts) and kept
 * among the measurements under this key; 4:3 until it is known.
 */
export const PLACEHOLDER_ASPECT = 4 / 3;

/** Taller than this (height over width) and the whole image scales down to fit. */
export const MAX_TALL = 2;

/** A photo's move as drawn: set by hand, the pile's own tilt where none is set (photo-spread.ts). */
export function photoMove<T extends { tilt?: number }>(
  set: T | undefined,
  photo: Pick<PhotoCard, 'tilt'>,
): T | undefined {
  if (!photo.tilt || set?.tilt !== undefined) return set;
  return { ...set, tilt: photo.tilt } as T;
}

export function aspectKey(path: string): string {
  return `aspect:${path}`;
}

/** The key a measured line count is kept under. */
export function measureKey(id: string, textW: number, indent: number, size = 10): string {
  return `${id}:${Math.round(textW)}:${Math.round(indent)}:${size}`;
}

/** Everything a shape needs to know about where it is going. */
type Context = {
  col: number;
  m: BoardMetrics;
  /** The item above in the lane, when there is one. */
  above: BoardPiece | undefined;
  /** True when the lanes to the right are empty over this band (relative to the lane's left line and the piece's top). */
  room: (band: Box) => boolean;
  measured: Measured;
  /**
   * How many lanes just to its left hold nothing at all in this row: a label
   * that cannot reach right may reach into them (review: the last lane).
   * They are laid out after it, so only lanes that stay empty are safe.
   */
  emptyLeft: number;
};

/**
 * How many lines the words take in `textW` of room, the first line `indent`
 * shorter: as the browser measured them when it has, else an estimate
 * generous enough that words never outgrow their box.
 */
function linesIn(card: Card, textW: number, indent: number, icon: boolean, ctx: Context): number {
  const { m } = ctx;
  const known = ctx.measured[measureKey(card.splash.id, textW, indent, m.caption.size)];
  if (known) return Math.min(m.caption.lines, Math.max(1, known));
  const charW = m.caption.size * CHAR_EM;
  const chars = Math.max(2, Math.floor(textW / charW));
  const length =
    [...captionOf(card)].length +
    (card.joint || card.together ? FACES_CHARS : 0) +
    (icon ? ICON_CHARS : 0) +
    Math.ceil(indent / charW);
  return Math.min(m.caption.lines, Math.max(1, Math.ceil(length / chars)));
}

/** A label's words: inside its padding, the first line apart when it is indented. */
function textOf(
  label: Box,
  pad: BoardPiece['pad'],
  indent: number,
  lines: number,
  m: BoardMetrics,
): Box[] {
  const x = label.x + pad.left;
  const y = label.y + pad.top;
  const w = label.w - pad.left - pad.right;
  if (indent <= 0) return [{ x, y, w, h: lines * m.caption.line }];
  const first = { x: x + indent, y, w: w - indent, h: m.caption.line };
  return lines > 1
    ? [first, { x, y: y + m.caption.line, w, h: (lines - 1) * m.caption.line }]
    : [first];
}

type Shape = Omit<
  BoardPiece,
  'id' | 'card' | 'day' | 'week' | 'col' | 'label' | 'muted' | 'type' | 'x' | 'y'
>;

/** A label's vertical padding: shallow with no fill, where it would only make gaps. */
function padY(label: LabelStyle, m: BoardMetrics): { top: number; bottom: number } {
  return label === 'none' ? m.pad.none : m.pad.filled;
}

/**
 * Where a lane's right line is, from its own left line: the next lane's x
 * less this one's, as the board places them — so a label measured back from
 * it ends exactly on that line, never a float past it into the next lane.
 */
function laneEnd(ctx: Context): number {
  return (ctx.col + 1) * ctx.m.column - ctx.col * ctx.m.column;
}

/**
 * A label's width, on a phone reaching across up to two empty lanes to its
 * right so short words read in a line or two, not fragments (review): the
 * widest the lanes allow, from two lanes down to none. With no room to the
 * right — the last lane, or the next one taken — it reaches left instead,
 * by the same rule, into lanes with nothing in this row (`lead` lanes): never
 * over another lane's items (review).
 */
function spanLabel(
  x: number,
  pad: { top: number; bottom: number; left: number; right: number },
  heightFor: (w: number) => { lines: number; h: number },
  ctx: Context,
): { w: number; span: number; lead: number; lines: number; h: number } {
  const { m, col } = ctx;
  const own = m.column - x;
  const most = m.narrow ? Math.min(PHONE_SPAN_MAX, m.columns - 1 - col) : 0;
  for (let k = most; k > 0; k -= 1) {
    const w = own + k * m.column;
    const fit = heightFor(w);
    if (ctx.room({ x: m.column, y: 0, w: k * m.column, h: fit.h })) {
      return { w, span: k, lead: 0, ...fit };
    }
  }
  const back = m.narrow ? Math.min(PHONE_SPAN_MAX, ctx.emptyLeft) : 0;
  if (back > 0) {
    const w = own + back * m.column;
    return { w, span: 0, lead: back, ...heightFor(w) };
  }
  return { w: own, span: 0, lead: 0, ...heightFor(own) };
}

/**
 * A label's width set by hand, as a share of the lane (0027): drawn as set,
 * across the lanes to its right if it is wider than its own — the person's
 * choice, so no room is asked for; else null, the recipe's width.
 */
function handWidth(
  card: Card,
  x: number,
  heightFor: (w: number) => { lines: number; h: number },
  m: BoardMetrics,
): { w: number; span: number; lines: number; h: number } | null {
  const set = card.layout?.label?.width;
  if (set === undefined) return null;
  const w = Math.max(m.pad.side * 2 + 8, Math.round(set * m.column));
  return { w, span: Math.max(0, Math.ceil((x + w) / m.column) - 1), ...heightFor(w) };
}

function base(
  card: Card,
): Pick<
  Shape,
  | 'fan'
  | 'morePhotos'
  | 'photoBox'
  | 'slot'
  | 'slotBox'
  | 'slotBounds'
  | 'slotAt'
  | 'slotRotate'
  | 'tuck'
> {
  return {
    fan: [],
    morePhotos: 0,
    photoBox: null,
    slot: isOpenJoint(card),
    slotBox: null,
    slotBounds: null,
    slotAt: null,
    slotRotate: 0,
    tuck: 0,
  };
}

/** A box turned by `deg` about one of its top corners: the box it then covers. */
function tilted(box: Box, deg: number, pivot: 'left' | 'right'): Box {
  const t = (Math.abs(deg) * Math.PI) / 180;
  const w = box.w * Math.cos(t) + box.h * Math.sin(t);
  const h = box.w * Math.sin(t) + box.h * Math.cos(t);
  // Turned down about its top corner: the top edge never rises above the pivot.
  return pivot === 'right'
    ? { x: box.x + box.w - w, y: box.y, w, h }
    : { x: box.x, y: box.y, w, h };
}

/**
 * The open slot (review), stuck on the label's bottom-right corner with
 * two fifths of it past the label, where the lanes to the right are empty
 * there; else on the bottom-left corner, inside the lane. It rides up onto
 * the label by the label's bottom padding (review) — over its edge, never
 * its words — and tilts 3–6° about the corner it hangs from, downward, so
 * it rises no further. The piece grows to hold what hangs below.
 */
function withSlot(shape: Shape, card: Card, ctx: Context): Shape {
  if (!shape.slot) return shape;
  const { m } = ctx;
  const faces = Math.min(card.awaiting!.length, m.narrow ? 2 : 4);
  const words = (m.narrow ? SLOT_WORDS.narrow : SLOT_WORDS.wide).length * m.caption.size * CHAR_EM;
  const w = Math.ceil(
    SLOT_BORDER_PX * 2 +
      SLOT_PAD_PX * 2 +
      SLOT_FACE_PX +
      (faces - 1) * (SLOT_FACE_PX - SLOT_FACE_OVERLAP) +
      SLOT_GAP_PX +
      words,
  );
  const label = shape.labelBox;
  // Up onto the label (review), by all of its bottom padding: over its edge, never its words.
  const y = label.y + label.h - shape.pad.bottom;
  const tilt = SLOT_TILT_MIN + unit(card.splash.id, 'slot') * (SLOT_TILT_MAX - SLOT_TILT_MIN);
  const right: Box = { x: label.x + label.w - Math.round(w * 0.6), y, w, h: SLOT_PX };
  const rightBounds = tilted(right, tilt, 'left');
  const past = rightBounds.x + rightBounds.w - m.column;
  const fits = past <= 0 || ctx.room({ x: m.column, y: rightBounds.y, w: past, h: rightBounds.h });
  const [slotBox, slotBounds, slotAt, slotRotate] = fits
    ? [right, rightBounds, 'right' as const, tilt]
    : (() => {
        const left: Box = { x: label.x + 2, y, w: Math.min(w, m.column - label.x - 2), h: SLOT_PX };
        return [left, tilted(left, tilt, 'right'), 'left' as const, -tilt] as const;
      })();
  return {
    ...shape,
    slotBox,
    slotBounds,
    slotAt,
    slotRotate,
    w: Math.max(shape.w, slotBounds.x + slotBounds.w),
    h: Math.max(shape.h, slotBounds.y + slotBounds.h),
  };
}

/**
 * A (Hoppers): the icon inline, at the words' height. On a desktop the
 * label starts 35–45% into its lane at the lane's width, overhanging the
 * next where that lane is empty at its height, else from 15% to the line;
 * on a phone it starts at the line and reaches across empty lanes.
 */
function shapeA(card: Card, plan: Plan, ctx: Context): Shape {
  const { m, col } = ctx;
  const pad = { ...padY(plan.label, m), left: m.pad.side, right: m.pad.right };
  const fitFor = (w: number) => {
    const lines = linesIn(card, w - pad.left - pad.right, 0, true, ctx);
    return { lines, h: pad.top + lines * m.caption.line + pad.bottom };
  };
  const shape = (labelBox: Box, lines: number, overhang: boolean, span: number): Shape => ({
    ...base(card),
    recipe: 'A',
    variant: 'sticker',
    overhang,
    span,
    stickerSize: null,
    stickerAt: null,
    indent: 0,
    labelBox,
    textBoxes: textOf(labelBox, pad, 0, lines, m),
    stickerBox: null,
    pad,
    center: false,
    inlineIcon: true,
    captionLines: lines,
    w: labelBox.x + labelBox.w,
    h: labelBox.h,
  });
  const hand = (x: number) => handWidth(card, x, fitFor, m);
  if (m.narrow) {
    const set = hand(0);
    const fit = set ? { ...set, lead: 0 } : spanLabel(0, pad, fitFor, ctx);
    // Reaching left, the label starts that many lanes back from its own.
    const x = fit.lead > 0 ? -fit.lead * m.column : 0;
    const w = fit.lead > 0 ? laneEnd(ctx) - x : fit.w;
    return shape({ x, y: 0, w, h: fit.h }, fit.lines, fit.span > 0, fit.span);
  }
  if (col < m.columns - 1) {
    const x = Math.round(
      m.column * (A_START_MIN + unit(card.splash.id, 'shift') * (A_START_MAX - A_START_MIN)),
    );
    const fit = fitFor(m.column);
    if (ctx.room({ x: m.column, y: 0, w: x, h: fit.h })) {
      const set = hand(x);
      if (set) return shape({ x, y: 0, w: set.w, h: set.h }, set.lines, set.span > 0, set.span);
      return shape({ x, y: 0, w: m.column, h: fit.h }, fit.lines, true, 0);
    }
  }
  const x = Math.round(m.column * A_FALLBACK);
  const set = hand(x);
  if (set) return shape({ x, y: 0, w: set.w, h: set.h }, set.lines, set.span > 0, set.span);
  const fit = fitFor(m.column - x);
  return shape({ x, y: 0, w: m.column - x, h: fit.h }, fit.lines, false, 0);
}

/**
 * B (Lynn Canyon): the label from its lane's line and a large sticker — on
 * a filled label centred on its top-left corner, the first line indented
 * past its inner half; with no fill, left of the first line, centred on
 * it, the words starting after it. The sticker overhangs the line by at
 * most the lane before's right padding, so a bigger one starts its label
 * further in; in the first lane it stays on the board. Where it would
 * touch the words above, it moves left of the line, then steps down a
 * size; the label grows to hold a sticker hanging below its first line.
 */
function shapeB(card: Card, plan: Plan, ctx: Context): Shape {
  const { m, col, above } = ctx;
  // A size set by hand is drawn as set: no stepping down, no moving (review).
  const handSize = card.layout?.icon?.size;
  const sizes = handSize
    ? [plan.size ?? 'small']
    : (['big', 'medium', 'small'] as const).filter(
        (s, at, all) => at >= all.indexOf(plan.size ?? 'small'),
      );
  const places: StickerAt[] = plan.label === 'none' ? ['left'] : ['corner', 'left'];
  const aboveWords = above ? above.textBoxes.map((b) => onBoard(above, b)) : [];
  const top = above ? above.y + above.h : 0;
  let fallback: Shape | null = null;
  for (const size of sizes) {
    for (const at of places) {
      const s = handSize ? Math.round(handSize * m.caption.line) : m.stickers[size];
      const half = s / 2;
      const x = col === 0 ? half : Math.max(0, Math.ceil(half - m.pad.right));
      const v = padY(plan.label, m);
      const left = at === 'left' ? Math.ceil(half) + 4 : m.pad.side;
      const indent = at === 'corner' ? Math.max(0, Math.ceil(half + 2 - left)) : 0;
      const cy = at === 'corner' ? 0 : v.top + m.caption.line / 2;
      const stickerBox = { x: x - half, y: cy - half, w: s, h: s };
      const fitFor = (w: number) => {
        const lines = linesIn(card, w - left - m.pad.right, indent, false, ctx);
        // A sticker hanging below the words keeps its lower half on this label's padding.
        const bottom = Math.max(
          v.bottom,
          Math.ceil(stickerBox.y + s - (v.top + lines * m.caption.line)) - 4,
        );
        return { lines, h: v.top + lines * m.caption.line + bottom, bottom };
      };
      const pad0 = { top: v.top, bottom: v.bottom, left, right: m.pad.right };
      const set = handWidth(card, x, fitFor, m);
      const fit = set ? { ...set, lead: 0 } : spanLabel(x, pad0, (w) => fitFor(w), ctx);
      const bottom = fitFor(fit.w).bottom;
      const pad = { ...pad0, bottom };
      // Reaching left, the label and its sticker start that many lanes back.
      const back = fit.lead * m.column;
      const startX = x - back;
      const labelBox = {
        x: startX,
        y: 0,
        w: fit.lead > 0 ? laneEnd(ctx) - startX : fit.w,
        h: fit.h,
      };
      stickerBox.x -= back;
      const shape: Shape = {
        ...base(card),
        recipe: 'B',
        variant: 'sticker',
        overhang: fit.span > 0,
        span: fit.span,
        stickerSize: size,
        stickerAt: at,
        indent,
        labelBox,
        textBoxes: textOf(labelBox, pad, indent, fit.lines, m),
        stickerBox,
        pad,
        center: false,
        inlineIcon: false,
        captionLines: fit.lines,
        w: labelBox.x + labelBox.w,
        h: fit.h,
      };
      fallback = shape;
      const onPage = { x: ctx.col * m.column + stickerBox.x, y: top + stickerBox.y, w: s, h: s };
      if (handSize || aboveWords.every((w) => !intersects(onPage, w))) return shape;
    }
  }
  return fallback!;
}

/**
 * C (Beef Short Rib): up to three photo cards 55–70% of the lane wide, each
 * its own ratio tall (never cropped), left or
 * right, the caption directly under with its icon inline — centred under
 * the card, or on a phone reaching across empty lanes; tucked up into the
 * item above's bottom padding, as far as that padding goes (10px at most).
 */
function shapeC(card: Card, plan: Plan, ctx: Context): Shape {
  const { m, above } = ctx;
  const id = card.splash.id;
  const photos = card.photos!;
  const auto = Math.round(m.column * (C_MIN + unit(id, 'photo') * (C_MAX - C_MIN)));
  const shown = photos.slice(0, PHOTOS_SHOWN);
  // A photo's size set by hand, as a share of the lane (review); else the recipe's.
  const sizeOf = (path: string): number => {
    const set = card.layout?.photos?.[path]?.size;
    return set ? Math.round(m.column * set) : auto;
  };
  // Its place is the recipe's: left, or right against the line, for the
  // recipe's own size (review, 2026-10-27). A size set by hand grows it right
  // and down from that corner, so a resize never pulls the photo, or the
  // caption that starts at its left edge, to the left.
  // A pile (photo-spread.ts) grows right from the lane's left line.
  const x = shown.length > 1 || draw(id, 'align', 2) === 0 ? 0 : Math.floor(m.column - auto);
  // The newest first, on top; a following photo's size only when set by hand.
  const pile = (scale: number) =>
    spreadPhotos(
      shown.map((p, at) => ({
        path: p.path,
        size:
          at === 0 || card.layout?.photos?.[p.path]?.size
            ? Math.round(sizeOf(p.path) * scale)
            : null,
        ratio: ctx.measured[aspectKey(p.path)] ?? PLACEHOLDER_ASPECT,
      })),
      Math.round(sizeOf(shown[0].path) * scale),
      (salt) => unit(id, salt),
    );
  let spread = pile(1);
  // Past the lane, it overhangs into empty lanes as a label does; with none
  // empty, the whole pile shrinks to the lane, in the same proportions.
  if (
    x + spread.w > m.column &&
    !ctx.room({ x: m.column, y: 0, w: x + spread.w - m.column, h: spread.h })
  ) {
    spread = pile((m.column - x) / spread.w);
  }
  const byPath = new Map(shown.map((p) => [p.path, p]));
  // Back to front: the first — the newest — is drawn last, on top.
  const fan: PhotoCard[] = spread.cards
    .map((c) => ({
      ...byPath.get(c.path)!,
      size: c.size,
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      tilt: c.tilt,
    }))
    .reverse();
  // The pile's box is the photo area; the caption sits under its lowest edge.
  const area = { x, y: 0, w: spread.w, h: spread.h };
  // The caption keeps to the front photo's width, as it did to the one photo.
  const size = spread.cards[0].w;
  const side = Math.min(m.pad.side, Math.floor(size / 8));
  const v = padY(plan.label, m);
  // Against the line, the caption keeps the right padding the next lane's sticker hangs on.
  const right = x + size >= m.column - 1 ? m.pad.right : side;
  const pad = { ...v, right, left: side };
  const fitFor = (w: number) => {
    const lines = linesIn(card, w - pad.left - pad.right, 0, true, ctx);
    return { lines, h: v.top + lines * m.caption.line + v.bottom };
  };
  const set = handWidth(card, x, fitFor, m);
  let fit = set ?? { w: size, span: 0, ...fitFor(size) };
  if (m.narrow && !set) {
    const wide = spanLabel(x, pad, fitFor, {
      ...ctx,
      room: (band) => ctx.room({ ...band, y: band.y + area.h }),
    });
    if (wide.span > 0) fit = wide;
  }
  const labelBox = { x, y: area.h, w: fit.w, h: fit.h };
  return {
    ...base(card),
    recipe: 'C',
    variant: 'photo',
    overhang: fit.span > 0,
    span: fit.span,
    stickerSize: null,
    stickerAt: null,
    indent: 0,
    tuck: above ? Math.min(C_TUCK_PX, above.pad.bottom) : 0,
    fan,
    morePhotos: photos.length - shown.length,
    labelBox,
    textBoxes: textOf(labelBox, pad, 0, fit.lines, m),
    photoBox: area,
    stickerBox: null,
    pad,
    center: fit.span === 0,
    inlineIcon: true,
    captionLines: fit.lines,
    w: Math.max(m.column, x + fit.w),
    h: labelBox.y + labelBox.h,
  };
}

/**
 * The board: lanes of days in rows, each post on its day, ranged posts as
 * bands along the top of each row they cross. A row is laid out right to
 * left, so an A label decides its overhang against a next lane already
 * final; a row is as tall as its tallest lane.
 */
function layoutBoard(
  cards: Card[],
  rows: CellSpec[][],
  scope: { first: IsoDate; last: IsoDate },
  m: BoardMetrics,
  span: 'week' | 'month' | 'lane',
  measured: Measured,
  {
    cellOf = (card) => card.day,
    bands = true,
  }: {
    /** The cell a card sits in: its day on the Calendar; its day and lane in the Lane view. */
    cellOf?: (card: Card) => string | null;
    /** Ranged posts as bands across their days (the Calendar); else one piece on its day. */
    bands?: boolean;
  } = {},
): Pick<BoardLayout, 'weeks' | 'pieces' | 'tapes' | 'height'> {
  const inScope = (day: IsoDate): boolean => day >= scope.first && day <= scope.last;
  // Every day on the grid takes its posts — a month's first and last rows
  // carry the days before and after it too, drawn at half strength.
  const gridFirst = rows[0][0].day;
  const gridLast = rows[rows.length - 1][rows[rows.length - 1].length - 1].day;
  const keys = new Set(rows.flatMap((row) => row.map((cell) => cell.key)));

  // A cell's posts, oldest first; ranged posts set apart as bands.
  const byDay = new Map<string, Card[]>();
  const ranged: Card[] = [];
  for (const card of cards) {
    const range = bands ? spanOf(card) : null;
    if (range) {
      if (range.start <= gridLast && range.end >= gridFirst) ranged.push(card);
      continue;
    }
    const key = cellOf(card);
    if (key === null || !keys.has(key)) continue;
    const list = byDay.get(key);
    if (list) list.push(card);
    else byDay.set(key, [card]);
  }
  // A cell's posts in the order they were made: never by their latest
  // ripple, which would move a post — and every hand-set offset on it — each
  // time someone adds to it (review: a ripple added broke a set layout).
  for (const list of byDay.values()) {
    list.sort(
      (a, b) =>
        a.splash.createdAt.localeCompare(b.splash.createdAt) ||
        a.splash.id.localeCompare(b.splash.id),
    );
  }
  ranged.sort(
    (a, b) =>
      a.splash.range!.start.localeCompare(b.splash.range!.start) ||
      b.splash.range!.end.localeCompare(a.splash.range!.end) ||
      a.splash.id.localeCompare(b.splash.id),
  );

  const pieces: BoardPiece[] = [];
  const tapes: BoardTape[] = [];
  const weeks: BoardWeek[] = [];
  // A week's lanes carry their day in the header; a month's cells number themselves.
  const numberBand = span === 'month' ? DAY_NUMBER_PX : 0;
  // The Lane view's headers and date rail are its own: its rows start at the top.
  let y = span === 'month' ? MONTH_HEADER_PX : span === 'week' ? HEADER_PX : 0;
  // A cell's records: its posts and every range crossing its day, for its waves.
  const countOf = (cell: CellSpec): number =>
    (byDay.get(cell.key)?.length ?? 0) +
    ranged.filter((c) => c.splash.range!.start <= cell.day && c.splash.range!.end >= cell.day)
      .length;

  rows.forEach((specs, index) => {
    const cells: BoardCell[] = specs.map((spec, col) => ({
      day: spec.day,
      key: spec.key,
      inMonth: inScope(spec.day),
      col,
      x: col * m.column,
      count: countOf(spec),
    }));

    // Bands: the range's days within this row and this scope, packed into lanes.
    const ends: number[] = [];
    const rowTapes: Omit<BoardTape, 'y'>[] = [];
    const lanes: number[] = [];
    // Each band lane as tall as its tallest band.
    const laneH: number[] = [];
    for (const card of ranged) {
      const range = spanOf(card)!;
      const cols = cells.filter((c) => c.day >= range.start && c.day <= range.end);
      if (cols.length === 0) continue;
      const startCol = cols[0].col;
      const endCol = cols[cols.length - 1].col;
      let lane = ends.findIndex((end) => end < startCol);
      if (lane === -1) {
        lane = ends.length;
        ends.push(endCol);
      } else ends[lane] = endCol;
      lanes.push(lane);
      const size = metricsFor(m, card.layout?.label?.fontSize).caption.size;
      const h = Math.max(TAPE_PX, size + TAPE_PX - BASE_PX.wide);
      laneH[lane] = Math.max(laneH[lane] ?? 0, h);
      rowTapes.push({
        key: `${card.splash.id}:${index}`,
        id: card.splash.id,
        card,
        week: index,
        startCol,
        endCol,
        startsHere: cols[0].day === range.start,
        endsHere: cols[cols.length - 1].day === range.end,
        muted: cols.every((c) => !c.inMonth),
        // The full width of its lanes, edge to edge.
        x: startCol * m.column,
        w: (endCol - startCol + 1) * m.column,
        h,
        size,
      });
    }
    // Under the bands, room for a first sticker to hang into without touching their words.
    const laneTop = laneH.map((_, l) =>
      laneH.slice(0, l).reduce((sum, h) => sum + h + TAPE_GAP_PX, 0),
    );
    const tapeBlock =
      ends.length > 0
        ? laneTop[laneH.length - 1] +
          laneH[laneH.length - 1] +
          TAPE_GAP_PX +
          Math.ceil(m.stickers.big / 2)
        : 0;
    rowTapes.forEach((tape, at) => {
      tapes.push({ ...tape, y: y + numberBand + laneTop[lanes[at]] });
    });

    // Pieces: right to left, so each lane decides its reach against lanes
    // already final; each lane stacked in time order with no gap.
    const byCol = new Map<number, BoardPiece[]>();
    // Lanes with nothing of their own in this row: a label may reach left into them.
    const holds = cells.map((c) => (byDay.get(c.key)?.length ?? 0) > 0);
    const emptyLeftOf = (col: number): number => {
      let n = 0;
      for (let j = col - 1; j >= 0 && !holds[j]; j -= 1) n += 1;
      return n;
    };
    let tallest = span === 'month' ? m.rowBase : 0;
    for (const cell of [...cells].reverse()) {
      const list = byDay.get(cell.key) ?? [];
      const right = [...byCol.entries()].filter(([c]) => c > cell.col).flatMap(([, ps]) => ps);
      // The lanes to the right are empty at a band when nothing of theirs — label, photo, sticker, slot — is there.
      const room =
        (top: number) =>
        (band: Box): boolean => {
          const reach = { x: cell.x + band.x, y: top + band.y, w: band.w, h: band.h };
          return right.every((p) => extentOf(p).every((box) => !intersects(reach, box)));
        };
      let top = y + numberBand + tapeBlock;
      const plans = planDay(list);
      const lane: BoardPiece[] = [];
      list.forEach((card, at) => {
        const plan = plans[at];
        // Its own type, when a person set one for its label (review).
        const pm = metricsFor(m, card.layout?.label?.fontSize);
        const shapeAt = (y0: number): Shape => {
          const ctx: Context = {
            col: cell.col,
            m: pm,
            above: lane[at - 1],
            room: room(y0),
            measured,
            emptyLeft: emptyLeftOf(cell.col),
          };
          return plan.recipe === 'C'
            ? shapeC(card, plan, ctx)
            : plan.recipe === 'A'
              ? shapeA(card, plan, ctx)
              : shapeB(card, plan, ctx);
        };
        let drawn = shapeAt(top);
        // The lane's first item keeps its sticker in its row, off the header and
        // the day's number: it starts as far down as the sticker hangs up, unless
        // the bands above already left that room — and is shaped again there.
        const hang =
          at === 0 && tapeBlock === 0 && drawn.stickerBox
            ? Math.max(0, Math.ceil(-drawn.stickerBox.y))
            : 0;
        if (hang > 0) drawn = shapeAt(top + hang);
        const ctx: Context = {
          col: cell.col,
          m: pm,
          above: lane[at - 1],
          room: room(top + hang - drawn.tuck),
          measured,
          emptyLeft: emptyLeftOf(cell.col),
        };
        const shape = withSlot(drawn, card, ctx);
        const pieceY = top + hang - shape.tuck;
        lane.push({
          id: card.splash.id,
          card,
          day: cell.day,
          week: index,
          col: cell.col,
          label: plan.label,
          type: pm.caption,
          muted: !cell.inMonth,
          ...shape,
          x: cell.x,
          y: pieceY,
        });
        top = pieceY + shape.h;
      });
      byCol.set(cell.col, lane);
      tallest = Math.max(tallest, top - y, numberBand + tapeBlock);
    }
    for (const cell of cells) pieces.push(...(byCol.get(cell.col) ?? []));
    weeks.push({ index, y, h: tallest, cells });
    y += tallest;
  });

  return { weeks, pieces, tapes, height: y + FOOT_PX };
}

/**
 * A month fitted to the screen (review): when its rows' natural heights fit
 * the room under the weekday header, the room left over is shared among
 * them in proportion to those heights — the month fills the screen with no
 * scroll, and busy weeks get the most air; when they do not fit, every row
 * keeps its natural height and the board scrolls. A row is never shorter
 * than its content; its items stay where they were within it.
 */
function fillRows(
  laid: Pick<BoardLayout, 'weeks' | 'pieces' | 'tapes' | 'height'>,
  room: number,
): Pick<BoardLayout, 'weeks' | 'pieces' | 'tapes' | 'height'> {
  const total = laid.weeks.reduce((sum, w) => sum + w.h, 0);
  if (laid.weeks.length === 0 || total >= room) return laid;
  const spare = room - total;
  let given = 0;
  let shift = 0;
  const moved = new Map<number, number>();
  const weeks = laid.weeks.map((week, at) => {
    // Whole pixels; the last row takes what rounding left, so the rows meet the bottom exactly.
    const more =
      at === laid.weeks.length - 1 ? spare - given : Math.floor((spare * week.h) / total);
    given += more;
    moved.set(week.index, shift);
    const next = { ...week, y: week.y + shift, h: week.h + more };
    shift += more;
    return next;
  });
  return {
    weeks,
    pieces: laid.pieces.map((p) => ({ ...p, y: p.y + (moved.get(p.week) ?? 0) })),
    tapes: laid.tapes.map((t) => ({ ...t, y: t.y + (moved.get(t.week) ?? 0) })),
    // Exactly the room: no foot to scroll to.
    height: weeks[weeks.length - 1].y + weeks[weeks.length - 1].h,
  };
}

/** One month: weekday headers, rows of weeks, days outside the month muted and empty. */
export function layoutMonthBoard(
  cards: Card[],
  month: string,
  {
    width,
    fill,
    weekStart = WEEK_START,
    measured = {},
  }: {
    width: number;
    /** The board's visible height, header included: a month that fits fills it, with no scroll. */
    fill?: number;
    weekStart?: number;
    measured?: Measured;
  },
): BoardLayout {
  const m = boardMetrics(width);
  const rows = monthDays(month, weekStart);
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  // The grid is exactly the weeks holding a day of the month, from the week of the 1st.
  const natural = layoutBoard(
    cards,
    rows.map((days) => days.map((day) => ({ key: day, day }))),
    { first: `${month}-01`, last },
    m,
    'month',
    measured,
  );
  const laid = fill === undefined ? natural : fillRows(natural, fill - MONTH_HEADER_PX);
  return {
    span: 'month',
    metrics: m,
    key: month,
    title: boardTitle(month),
    headers: rows[0].map((day, i) => ({
      day,
      number: Number(day.slice(8)),
      weekday: WEEKDAYS[(i + weekStart) % 7],
    })),
    width: m.width,
    ...laid,
  };
}

/** One week (the default): seven full-height lanes headed by weekday and number, the week's range as the title. */
export function layoutWeekBoard(
  cards: Card[],
  day: IsoDate,
  {
    width,
    weekStart = WEEK_START,
    measured = {},
  }: { width: number; weekStart?: number; measured?: Measured },
): BoardLayout {
  const m = boardMetrics(width);
  const first = weekOf(day, weekStart);
  const days = Array.from({ length: COLUMNS }, (_, i) => addDays(first, i));
  const laid = layoutBoard(
    cards,
    [days.map((d) => ({ key: d, day: d }))],
    { first, last: days[COLUMNS - 1] },
    m,
    'week',
    measured,
  );
  return {
    span: 'week',
    metrics: m,
    key: first,
    title: weekTitle(first, weekStart),
    headers: days.map((d) => ({
      day: d,
      number: Number(d.slice(8)),
      weekday: WEEKDAYS[weekdayIndex(d)],
    })),
    width: m.width,
    ...laid,
  };
}

/** The Lane view drawn with the board's pieces (0045): rows of days, columns of lanes. */
export type LaneBoardLayout = Pick<BoardLayout, 'weeks' | 'pieces' | 'height'> & {
  metrics: BoardMetrics;
  /** Each row's key, by the row's index (`weeks[i]`). */
  rowKeys: string[];
};

/** A Lane view row: a day, or part of one (between two full-width bands). */
export type LaneRow = { key: string; day: IsoDate };

/**
 * The Lane view (0045, Yoonji, in the session): the Calendar's pieces and
 * recipes, a column per lane and a row per day that has posts, newest first,
 * each row as tall as its tallest lane. A ranged post is one piece on its
 * day in its column, never a band. `columnOf` places a card: its lane, or
 * its pool's column on Home; a card with none is not drawn. A row may be
 * part of a day — Members sets full-width bands between — and `rowOf` then
 * says which row a card is in (its day, unless said).
 */
export function layoutLaneBoard(
  cards: Card[],
  rows: (IsoDate | LaneRow)[],
  columns: string[],
  {
    width,
    measured = {},
    columnOf,
    rowOf = (card) => card.day,
  }: {
    width: number;
    measured?: Measured;
    columnOf: (card: Card) => string | null;
    rowOf?: (card: Card) => string | null;
  },
): LaneBoardLayout {
  const m = boardMetrics(width, Math.max(1, columns.length));
  const specs = rows.map((r) => (typeof r === 'string' ? { key: r, day: r } : r));
  if (specs.length === 0 || columns.length === 0) {
    return { metrics: m, weeks: [], pieces: [], height: 0, rowKeys: [] };
  }
  const grid = specs.map((row) =>
    columns.map((column) => ({ key: laneCell(row.key, column), day: row.day })),
  );
  const sorted = specs.map((r) => r.day).sort();
  const laid = layoutBoard(
    cards,
    grid,
    { first: sorted[0], last: sorted[sorted.length - 1] },
    m,
    'lane',
    measured,
    {
      bands: false,
      cellOf: (card) => {
        const column = columnOf(card);
        const row = rowOf(card);
        return column === null || row === null ? null : laneCell(row, column);
      },
    },
  );
  return {
    metrics: m,
    weeks: laid.weeks,
    pieces: laid.pieces,
    height: laid.height - FOOT_PX,
    rowKeys: specs.map((r) => r.key),
  };
}

/** A Lane view cell's key: its row (a day, or part of one) and its column. */
export function laneCell(row: string, column: string): string {
  return `${row}|${column}`;
}
