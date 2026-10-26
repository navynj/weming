import type { Card } from '@/features/home/grid';
import { monthKey } from '@/features/splash/summary';
import type { IsoDate } from '@/lib/time';

import { seedOf } from './layout-seed';

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
export type LabelStyle = 'none' | 'white' | 'ink';
export const LABEL_STYLES: readonly LabelStyle[] = ['none', 'white', 'ink'];

/** The sizes that follow the board's width. */
export type BoardMetrics = {
  width: number;
  column: number;
  /** A phone's lanes (under 80px): side padding halved, so words keep some room. */
  narrow: boolean;
  /** A month row's least height; a busy day grows its whole row. A week row has none. */
  rowBase: number;
  /** The caption's type: every title 10px (review). */
  caption: { size: number; line: number };
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
export function boardMetrics(width: number): BoardMetrics {
  const w = Math.max(COLUMNS * 40, Math.round(width));
  const column = w / COLUMNS;
  const narrow = column < 80;
  const size = 10;
  const line = size + 3;
  return {
    width: w,
    column,
    narrow,
    rowBase: narrow ? 96 : 132,
    caption: { size, line },
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
export type BoardCell = { day: IsoDate; inMonth: boolean; col: number; x: number; count: number };

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
  /** Upward from the area's bottom: a card behind peeks above the one in front. */
  dy: number;
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
  return card.joint === true && (card.awaiting?.length ?? 0) > 0;
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
export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Everything a piece draws on the board: its label, its photos, its sticker. */
export function extentOf(piece: BoardPiece): Box[] {
  return [piece.labelBox, piece.photoBox, piece.stickerBox, piece.slotBounds]
    .filter((box): box is Box => box !== null)
    .map((box) => onBoard(piece, box));
}

/** What a day decides for each of its items before they are shaped. */
type Plan = { recipe: Recipe; label: LabelStyle; size: StickerSize | null };

/**
 * A day's plan (review): photos take C; the rest A or B by the id, never
 * the same as the item above's (two photos in a row are both C, there
 * being no other way to draw them); a day of two or more items has a B —
 * an A turned, which can sit by no B, A never following A. B's stickers
 * take a size by the id, never the size of the day's B before, big at
 * most once and only in a day of two or more. A joint splash alternates
 * white and ink with the day's other joint ones; everything else takes no
 * fill.
 */
function planDay(cards: Card[]): Plan[] {
  let fill: LabelStyle | null = null;
  const recipes: Recipe[] = [];
  cards.forEach((card, at) => {
    if ((card.photos?.length ?? 0) > 0) {
      recipes.push('C');
      return;
    }
    const drawn: Recipe = draw(card.splash.id, 'recipe', 2) === 0 ? 'A' : 'B';
    const above = recipes[at - 1];
    recipes.push(drawn === above ? (drawn === 'A' ? 'B' : 'A') : drawn);
  });
  if (cards.length >= 2 && !recipes.includes('B')) {
    const at = recipes.indexOf('A');
    if (at >= 0) recipes[at] = 'B';
  }
  let lastSize: StickerSize | null = null;
  let bigUsed = false;
  return cards.map((card, at) => {
    let label: LabelStyle = 'none';
    if (card.joint) {
      const drawnFill: LabelStyle = draw(card.splash.id, 'label', 2) === 0 ? 'white' : 'ink';
      fill = drawnFill === fill ? (fill === 'white' ? 'ink' : 'white') : drawnFill;
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

/** The key a measured line count is kept under. */
export function measureKey(id: string, textW: number, indent: number): string {
  return `${id}:${Math.round(textW)}:${Math.round(indent)}`;
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
};

/**
 * How many lines the words take in `textW` of room, the first line `indent`
 * shorter: as the browser measured them when it has, else an estimate
 * generous enough that words never outgrow their box.
 */
function linesIn(card: Card, textW: number, indent: number, icon: boolean, ctx: Context): number {
  const { m } = ctx;
  const known = ctx.measured[measureKey(card.splash.id, textW, indent)];
  if (known) return Math.min(CAPTION_LINES, Math.max(1, known));
  const charW = m.caption.size * CHAR_EM;
  const chars = Math.max(2, Math.floor(textW / charW));
  const length =
    [...captionOf(card)].length +
    (card.joint ? FACES_CHARS : 0) +
    (icon ? ICON_CHARS : 0) +
    Math.ceil(indent / charW);
  return Math.min(CAPTION_LINES, Math.max(1, Math.ceil(length / chars)));
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
  'id' | 'card' | 'day' | 'week' | 'col' | 'label' | 'muted' | 'x' | 'y'
>;

/** A label's vertical padding: shallow with no fill, where it would only make gaps. */
function padY(label: LabelStyle, m: BoardMetrics): { top: number; bottom: number } {
  return label === 'none' ? m.pad.none : m.pad.filled;
}

/**
 * A label's width, on a phone reaching across up to two empty lanes to its
 * right so short words read in a line or two, not fragments (review): the
 * widest the lanes allow, from two lanes down to none.
 */
function spanLabel(
  x: number,
  pad: { top: number; bottom: number; left: number; right: number },
  heightFor: (w: number) => { lines: number; h: number },
  ctx: Context,
): { w: number; span: number; lines: number; h: number } {
  const { m, col } = ctx;
  const own = m.column - x;
  const most = m.narrow ? Math.min(PHONE_SPAN_MAX, COLUMNS - 1 - col) : 0;
  for (let k = most; k > 0; k -= 1) {
    const w = own + k * m.column;
    const fit = heightFor(w);
    if (ctx.room({ x: m.column, y: 0, w: k * m.column, h: fit.h })) return { w, span: k, ...fit };
  }
  return { w: own, span: 0, ...heightFor(own) };
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
  if (m.narrow) {
    const fit = spanLabel(0, pad, fitFor, ctx);
    return shape({ x: 0, y: 0, w: fit.w, h: fit.h }, fit.lines, fit.span > 0, fit.span);
  }
  if (col < COLUMNS - 1) {
    const x = Math.round(
      m.column * (A_START_MIN + unit(card.splash.id, 'shift') * (A_START_MAX - A_START_MIN)),
    );
    const fit = fitFor(m.column);
    if (ctx.room({ x: m.column, y: 0, w: x, h: fit.h })) {
      return shape({ x, y: 0, w: m.column, h: fit.h }, fit.lines, true, 0);
    }
  }
  const x = Math.round(m.column * A_FALLBACK);
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
  const sizes = (['big', 'medium', 'small'] as const).filter(
    (s, at, all) => at >= all.indexOf(plan.size ?? 'small'),
  );
  const places: StickerAt[] = plan.label === 'none' ? ['left'] : ['corner', 'left'];
  const aboveWords = above ? above.textBoxes.map((b) => onBoard(above, b)) : [];
  const top = above ? above.y + above.h : 0;
  let fallback: Shape | null = null;
  for (const size of sizes) {
    for (const at of places) {
      const s = m.stickers[size];
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
      const fit = spanLabel(x, pad0, (w) => fitFor(w), ctx);
      const bottom = fitFor(fit.w).bottom;
      const pad = { ...pad0, bottom };
      const labelBox = { x, y: 0, w: fit.w, h: fit.h };
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
        w: x + fit.w,
        h: fit.h,
      };
      fallback = shape;
      const onPage = { x: ctx.col * m.column + stickerBox.x, y: top + stickerBox.y, w: s, h: s };
      if (aboveWords.every((w) => !intersects(onPage, w))) return shape;
    }
  }
  return fallback!;
}

/**
 * C (Beef Short Rib): up to three square cards 55–70% of the lane, left or
 * right, the caption directly under with its icon inline — centred under
 * the card, or on a phone reaching across empty lanes; tucked up into the
 * item above's bottom padding, as far as that padding goes (10px at most).
 */
function shapeC(card: Card, plan: Plan, ctx: Context): Shape {
  const { m, above } = ctx;
  const id = card.splash.id;
  const photos = card.photos!;
  const size = Math.round(m.column * (C_MIN + unit(id, 'photo') * (C_MAX - C_MIN)));
  const x = draw(id, 'align', 2) === 0 ? 0 : Math.floor(m.column - size);
  const shown = photos.slice(0, PHOTOS_SHOWN);
  let dy = 0;
  const fan: PhotoCard[] = [];
  // Back to front: the last shown — the newest — is drawn last, on top.
  for (let at = shown.length - 1; at >= 0; at -= 1) {
    fan.push({ ...shown[at], dy });
    dy += m.fanMin + draw(id, `fan:${at}`, m.fanMax - m.fanMin + 1);
  }
  const spread = fan.length > 0 ? fan[fan.length - 1].dy : 0;
  const photoBox = { x, y: 0, w: size, h: size + spread };
  const side = Math.min(m.pad.side, Math.floor(size / 8));
  const v = padY(plan.label, m);
  // Against the line, the caption keeps the right padding the next lane's sticker hangs on.
  const right = x + size >= m.column - 1 ? m.pad.right : side;
  const pad = { ...v, right, left: side };
  const fitFor = (w: number) => {
    const lines = linesIn(card, w - pad.left - pad.right, 0, true, ctx);
    return { lines, h: v.top + lines * m.caption.line + v.bottom };
  };
  let fit = { w: size, span: 0, ...fitFor(size) };
  if (m.narrow) {
    const wide = spanLabel(x, pad, fitFor, {
      ...ctx,
      room: (band) => ctx.room({ ...band, y: band.y + photoBox.h }),
    });
    if (wide.span > 0) fit = wide;
  }
  const labelBox = { x, y: photoBox.h, w: fit.w, h: fit.h };
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
    fan: fan.reverse(),
    morePhotos: photos.length - shown.length,
    labelBox,
    textBoxes: textOf(labelBox, pad, 0, fit.lines, m),
    photoBox,
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
  rows: IsoDate[][],
  scope: { first: IsoDate; last: IsoDate },
  m: BoardMetrics,
  span: 'week' | 'month',
  measured: Measured,
): Pick<BoardLayout, 'weeks' | 'pieces' | 'tapes' | 'height'> {
  const inScope = (day: IsoDate): boolean => day >= scope.first && day <= scope.last;
  // Every day on the grid takes its posts — a month's first and last rows
  // carry the days before and after it too, drawn at half strength.
  const gridFirst = rows[0][0];
  const gridLast = rows[rows.length - 1][COLUMNS - 1];
  const onGrid = (day: IsoDate): boolean => day >= gridFirst && day <= gridLast;

  // A day's posts, oldest first; ranged posts set apart as bands.
  const byDay = new Map<IsoDate, Card[]>();
  const ranged: Card[] = [];
  for (const card of cards) {
    const range = spanOf(card);
    if (range) {
      if (range.start <= gridLast && range.end >= gridFirst) ranged.push(card);
      continue;
    }
    if (!onGrid(card.day)) continue;
    const list = byDay.get(card.day);
    if (list) list.push(card);
    else byDay.set(card.day, [card]);
  }
  for (const list of byDay.values()) {
    list.sort(
      (a, b) =>
        a.instant - b.instant ||
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
  let y = span === 'month' ? MONTH_HEADER_PX : HEADER_PX;
  // A day's records: its posts and every range crossing it, for its waves.
  const countOf = (day: IsoDate): number =>
    (byDay.get(day)?.length ?? 0) +
    ranged.filter((c) => c.splash.range!.start <= day && c.splash.range!.end >= day).length;

  rows.forEach((days, index) => {
    const cells: BoardCell[] = days.map((day, col) => ({
      day,
      inMonth: inScope(day),
      col,
      x: col * m.column,
      count: countOf(day),
    }));

    // Bands: the range's days within this row and this scope, packed into lanes.
    const ends: number[] = [];
    const rowTapes: Omit<BoardTape, 'y'>[] = [];
    const lanes: number[] = [];
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
        h: TAPE_PX,
      });
    }
    // Under the bands, room for a first sticker to hang into without touching their words.
    const tapeBlock =
      ends.length > 0 ? ends.length * (TAPE_PX + TAPE_GAP_PX) + Math.ceil(m.stickers.big / 2) : 0;
    rowTapes.forEach((tape, at) => {
      tapes.push({ ...tape, y: y + numberBand + lanes[at] * (TAPE_PX + TAPE_GAP_PX) });
    });

    // Pieces: right to left, so each lane decides its reach against lanes
    // already final; each lane stacked in time order with no gap.
    const byCol = new Map<number, BoardPiece[]>();
    let tallest = span === 'month' ? m.rowBase : 0;
    for (const cell of [...cells].reverse()) {
      const list = byDay.get(cell.day) ?? [];
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
        const shapeAt = (y0: number): Shape => {
          const ctx: Context = { col: cell.col, m, above: lane[at - 1], room: room(y0), measured };
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
          m,
          above: lane[at - 1],
          room: room(top + hang - drawn.tuck),
          measured,
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

/** One month: weekday headers, rows of weeks, days outside the month muted and empty. */
export function layoutMonthBoard(
  cards: Card[],
  month: string,
  {
    width,
    weekStart = WEEK_START,
    measured = {},
  }: { width: number; weekStart?: number; measured?: Measured },
): BoardLayout {
  const m = boardMetrics(width);
  const rows = monthDays(month, weekStart);
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const laid = layoutBoard(cards, rows, { first: `${month}-01`, last }, m, 'month', measured);
  // The grid is exactly the weeks holding a day of the month, from the week of the 1st.
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
  const laid = layoutBoard(cards, [days], { first, last: days[COLUMNS - 1] }, m, 'week', measured);
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
