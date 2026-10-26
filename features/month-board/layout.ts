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
/** A month cell's day number and waves, at the top of the cell: nothing is placed over it. */
export const DAY_NUMBER_PX = 70;
/** How many waves a day shows at most. */
export const DAY_WAVES_MAX = 3;
const FOOT_PX = 24;

/** The three recipes. */
export type Recipe = 'A' | 'B' | 'C';
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
/** An open joint splash's slot, inline after its words: the room it takes, in characters. */
const SLOT_FACE_CHARS = 2;
const SLOT_WORDS_CHARS = 14;

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
  /**
   * B's sticker: about twice the line, held to twice the bottom padding so
   * its upper half lands on the item above's padding and never its words.
   */
  sticker: number;
  /**
   * A label's padding: 8 top, 12 sides (6 on the left on a phone), 12
   * bottom (review). The right side never drops under half a sticker: the
   * next lane's B sticker hangs that far over the line, onto padding only.
   */
  pad: { top: number; side: number; right: number; bottom: number };
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
  const bottom = 12;
  return {
    width: w,
    column,
    narrow,
    rowBase: narrow ? 96 : 132,
    caption: { size, line },
    sticker: Math.min(line * 2, bottom * 2),
    pad: {
      top: 8,
      side: narrow ? 6 : 12,
      right: Math.max(narrow ? 6 : 12, Math.ceil(Math.min(line * 2, bottom * 2) / 2)),
      bottom,
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
  /** A's label runs past the lane's right line, into an empty band of the next lane. */
  overhang: boolean;
  /** C tucks up into the item above's bottom padding. */
  tuck: number;
  /** The photo cards, back to front: the newest of the shown ones on top. */
  fan: PhotoCard[];
  /** Photos beyond those shown: the top card's "+N". */
  morePhotos: number;
  /** Within the piece: the label, its words, the photo area, B's sticker. */
  labelBox: Box;
  textBox: Box;
  photoBox: Box | null;
  stickerBox: Box | null;
  /** An open joint splash: its slot sits inline after the words, wrapping under only when the line is full. */
  slot: boolean;
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
  return [piece.labelBox, piece.photoBox, piece.stickerBox]
    .filter((box): box is Box => box !== null)
    .map((box) => onBoard(piece, box));
}

/** What a day decides for each of its items before they are shaped. */
type Plan = { recipe: Recipe; label: LabelStyle };

/**
 * A day's plan (review): photos take C; the rest A or B by the id, never
 * the same as the item above's (two photos in a row are both C, there
 * being no other way to draw them); a day of two or more items has a B —
 * an A turned, which can sit by no B, A never following A. A joint splash
 * alternates white and ink with the day's other joint ones; everything
 * else takes no fill.
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
  return cards.map((card, at) => {
    let label: LabelStyle = 'none';
    if (card.joint) {
      const drawnFill: LabelStyle = draw(card.splash.id, 'label', 2) === 0 ? 'white' : 'ink';
      fill = drawnFill === fill ? (fill === 'white' ? 'ink' : 'white') : drawnFill;
      label = fill;
    }
    return { recipe: recipes[at], label };
  });
}

/** How many lines the words take in a label `w` wide with these side paddings. */
function linesIn(
  card: Card,
  w: number,
  left: number,
  right: number,
  icon: boolean,
  m: BoardMetrics,
): number {
  const slot = isOpenJoint(card);
  const slotChars = slot
    ? Math.min(card.awaiting!.length, m.narrow ? 2 : 4) * SLOT_FACE_CHARS +
      (m.narrow ? 0 : SLOT_WORDS_CHARS) +
      2
    : 0;
  const chars = Math.max(2, Math.floor((w - left - right) / (m.caption.size * CHAR_EM)));
  const length =
    [...captionOf(card)].length +
    (card.joint ? FACES_CHARS : 0) +
    (icon ? ICON_CHARS : 0) +
    slotChars;
  return Math.min(CAPTION_LINES, Math.max(1, Math.ceil(length / chars)));
}

/** A label's words: inside its padding, as many lines as they take. */
function textOf(label: Box, pad: BoardPiece['pad'], lines: number, m: BoardMetrics): Box {
  return {
    x: label.x + pad.left,
    y: label.y + pad.top,
    w: label.w - pad.left - pad.right,
    h: lines * m.caption.line,
  };
}

type Shape = Omit<BoardPiece, 'id' | 'card' | 'day' | 'week' | 'col' | 'label' | 'x' | 'y'>;

/** A label box hugging its words: the padding and the lines, nothing more. */
function hug(lines: number, m: BoardMetrics): number {
  return m.pad.top + lines * m.caption.line + m.pad.bottom;
}

/**
 * A (Hoppers): the icon inline; the label from 35–45% into the lane, the
 * lane's width, overhanging the next — when `room` says the next lane is
 * empty at the height it would take — else from 15% to the line.
 */
function shapeA(card: Card, col: number, m: BoardMetrics, room: (band: Box) => boolean): Shape {
  const pad = { top: m.pad.top, right: m.pad.right, bottom: m.pad.bottom, left: m.pad.side };
  const wide = (): Shape | null => {
    if (col === COLUMNS - 1) return null;
    const x = Math.round(
      m.column * (A_START_MIN + unit(card.splash.id, 'shift') * (A_START_MAX - A_START_MIN)),
    );
    const lines = linesIn(card, m.column, pad.left, pad.right, true, m);
    const labelBox = { x, y: 0, w: m.column, h: hug(lines, m) };
    return room({ x: m.column, y: 0, w: x, h: labelBox.h }) ? label(labelBox, lines, true) : null;
  };
  const label = (labelBox: Box, lines: number, overhang: boolean): Shape => ({
    recipe: 'A',
    variant: 'sticker',
    overhang,
    tuck: 0,
    fan: [],
    morePhotos: 0,
    labelBox,
    textBox: textOf(labelBox, pad, lines, m),
    photoBox: null,
    stickerBox: null,
    slot: isOpenJoint(card),
    pad,
    center: false,
    inlineIcon: true,
    captionLines: lines,
    w: labelBox.x + labelBox.w,
    h: labelBox.h,
  });
  const over = wide();
  if (over) return over;
  const x = Math.round(m.column * A_FALLBACK);
  const lines = linesIn(card, m.column - x, pad.left, pad.right, true, m);
  return label({ x, y: 0, w: m.column - x, h: hug(lines, m) }, lines, false);
}

/**
 * B (Lynn Canyon): the label the lane wide from its line, a large sticker
 * centred on its top-left corner — half outside, up and left — the words
 * starting past its inner half. In the first lane the label starts half a
 * sticker in, so the sticker stays on the board.
 */
function shapeB(card: Card, col: number, m: BoardMetrics): Shape {
  const half = m.sticker / 2;
  const x = col === 0 ? half : 0;
  const pad = {
    top: m.pad.top,
    right: m.pad.right,
    bottom: m.pad.bottom,
    left: Math.max(m.pad.side, half),
  };
  const lines = linesIn(card, m.column - x, pad.left, pad.right, false, m);
  const labelBox = { x, y: 0, w: m.column - x, h: hug(lines, m) };
  return {
    recipe: 'B',
    variant: 'sticker',
    overhang: false,
    tuck: 0,
    fan: [],
    morePhotos: 0,
    labelBox,
    textBox: textOf(labelBox, pad, lines, m),
    photoBox: null,
    stickerBox: { x: x - half, y: -half, w: m.sticker, h: m.sticker },
    slot: isOpenJoint(card),
    pad,
    center: false,
    inlineIcon: false,
    captionLines: lines,
    w: m.column,
    h: labelBox.h,
  };
}

/**
 * C (Beef Short Rib): up to three square cards 55–70% of the lane, left or
 * right, the caption centred directly under them with its icon inline;
 * tucked up into the item above's bottom padding when there is one.
 */
function shapeC(card: Card, first: boolean, m: BoardMetrics): Shape {
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
  // Against the line, the caption keeps the right padding the next lane's sticker hangs on.
  const right = x + size >= m.column - 1 ? m.pad.right : side;
  const pad = { top: m.pad.top, right, bottom: m.pad.bottom, left: side };
  const lines = linesIn(card, size, pad.left, pad.right, true, m);
  const labelBox = { x, y: photoBox.h, w: size, h: hug(lines, m) };
  return {
    recipe: 'C',
    variant: 'photo',
    overhang: false,
    tuck: first ? 0 : C_TUCK_PX,
    fan: fan.reverse(),
    morePhotos: photos.length - shown.length,
    labelBox,
    textBox: textOf(labelBox, pad, lines, m),
    photoBox,
    stickerBox: null,
    slot: isOpenJoint(card),
    pad,
    center: true,
    inlineIcon: true,
    captionLines: lines,
    w: m.column,
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
): Pick<BoardLayout, 'weeks' | 'pieces' | 'tapes' | 'height'> {
  const inScope = (day: IsoDate): boolean => day >= scope.first && day <= scope.last;

  // A day's posts, oldest first; ranged posts set apart as bands.
  const byDay = new Map<IsoDate, Card[]>();
  const ranged: Card[] = [];
  for (const card of cards) {
    const range = spanOf(card);
    if (range) {
      if (range.start <= scope.last && range.end >= scope.first) ranged.push(card);
      continue;
    }
    if (!inScope(card.day)) continue;
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
      count: inScope(day) ? countOf(day) : 0,
    }));

    // Bands: the range's days within this row and this scope, packed into lanes.
    const ends: number[] = [];
    const rowTapes: Omit<BoardTape, 'y'>[] = [];
    const lanes: number[] = [];
    for (const card of ranged) {
      const range = spanOf(card)!;
      const cols = cells.filter((c) => c.inMonth && c.day >= range.start && c.day <= range.end);
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
        // The full width of its lanes, edge to edge.
        x: startCol * m.column,
        w: (endCol - startCol + 1) * m.column,
        h: TAPE_PX,
      });
    }
    // Under the bands, room for a first sticker to hang into without touching their words.
    const tapeBlock =
      ends.length > 0 ? ends.length * (TAPE_PX + TAPE_GAP_PX) + Math.ceil(m.sticker / 2) : 0;
    rowTapes.forEach((tape, at) => {
      tapes.push({ ...tape, y: y + numberBand + lanes[at] * (TAPE_PX + TAPE_GAP_PX) });
    });

    // Pieces: right to left, each lane stacked in time order with no gap.
    const byCol = new Map<number, BoardPiece[]>();
    let tallest = span === 'month' ? m.rowBase : 0;
    for (const cell of [...cells].reverse()) {
      const list = cell.inMonth ? (byDay.get(cell.day) ?? []) : [];
      const next = byCol.get(cell.col + 1) ?? [];
      // The next lane is empty at a band when nothing of it — label, photo, sticker — is there.
      const room =
        (top: number) =>
        (band: Box): boolean => {
          const reach = { x: cell.x + band.x, y: top + band.y, w: band.w, h: band.h };
          return next.every((p) => extentOf(p).every((box) => !intersects(reach, box)));
        };
      let top = y + numberBand + tapeBlock;
      const plans = planDay(list);
      const lane: BoardPiece[] = [];
      list.forEach((card, at) => {
        const plan = plans[at];
        const shape =
          plan.recipe === 'C'
            ? shapeC(card, at === 0, m)
            : plan.recipe === 'A'
              ? shapeA(card, cell.col, m, room(top))
              : shapeB(card, cell.col, m);
        const pieceY = top - shape.tuck;
        lane.push({
          id: card.splash.id,
          card,
          day: cell.day,
          week: index,
          col: cell.col,
          label: plan.label,
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
  { width, weekStart = WEEK_START }: { width: number; weekStart?: number },
): BoardLayout {
  const m = boardMetrics(width);
  const rows = monthDays(month, weekStart);
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const laid = layoutBoard(cards, rows, { first: `${month}-01`, last }, m, 'month');
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
  { width, weekStart = WEEK_START }: { width: number; weekStart?: number },
): BoardLayout {
  const m = boardMetrics(width);
  const first = weekOf(day, weekStart);
  const days = Array.from({ length: COLUMNS }, (_, i) => addDays(first, i));
  const laid = layoutBoard(cards, [days], { first, last: days[COLUMNS - 1] }, m, 'week');
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
