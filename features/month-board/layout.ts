import type { Card } from '@/features/home/grid';
import { monthKey } from '@/features/splash/summary';
import type { IsoDate } from '@/lib/time';

import { seedOf } from './layout-seed';

export { seedOf };

/**
 * The calendar's geometry (Calendar view), in logical pixels. It is laid
 * out at its room's own width, phone or desktop, and never scaled or
 * panned (review): seven lanes always fit.
 *
 * Readable first (review). Hard rules, never broken:
 * - nothing covers a label's words: no sticker, no other label, no photo;
 * - items never overlap: a day's stack down its lane in time order, no gap;
 * - a label overhangs into the next lane only where that lane is empty at
 *   its height, and never over the next lane's items;
 * - a label is at least 32px tall and its words wrap to three lines.
 *
 * The one dynamic axis is where a label starts: 0, 12, 24 or 36% into its
 * lane, by the id, never the same as the item above. One width, one
 * calendar: the same data at the same width always lays out the same.
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

/** The start offsets, as shares of the lane: the one axis that moves. */
export const OFFSET_STEPS = [0, 0.12, 0.24, 0.36] as const;
/** A label's least height, and how many lines its words wrap to. */
export const LABEL_MIN_PX = 32;
const CAPTION_LINES = 3;
/** About how wide one 10px Poppins character is, for the line estimate: generous, so words never outgrow their box. */
const CHAR_EM = 0.62;
/** The sticker is the icon at this many line heights, hanging off the label's top-left corner. */
export const STICKER_LINES = 1.4;
/** An open joint splash's slot, under its label. */
export const SLOT_PX = 22;

/** A range band's height, the gap between bands, and the lanes bands pack into. */
export const TAPE_PX = 24;
const TAPE_GAP_PX = 2;

/** At most this many photo cards; past it the top card carries "+N". */
export const PHOTOS_SHOWN = 3;
/** With photos the small icon leads the caption's words. */
const ICON_CHARS = 2;
/** Room the joint faces take after a caption, in characters. */
const FACES_CHARS = 4;

/**
 * A label's background (review): none — white words on the water — for
 * every splash but a joint one; a joint splash, where the calendar is
 * shared, white or ink, alternating within a day. Home and a pool of one
 * draw no fills at all.
 */
export type LabelStyle = 'none' | 'white' | 'ink';
export const LABEL_STYLES: readonly LabelStyle[] = ['none', 'white', 'ink'];

/** The sizes that follow the board's width. */
export type BoardMetrics = {
  width: number;
  column: number;
  /** A phone's lanes (under 80px): tighter padding. */
  narrow: boolean;
  /** A month row's least height; a busy day grows its whole row. A week row has none. */
  rowBase: number;
  /** The caption's type: every title 10px (review). */
  caption: { size: number; line: number };
  /** The sticker's size: 1.4 line heights. */
  sticker: number;
  /** A label's padding. The left one, beside a sticker, holds its inner half; the bottom one, the next item's. */
  pad: { top: number; bottom: number; right: number; left: number; leftCaption: number };
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
  const sticker = Math.round(line * STICKER_LINES);
  const half = Math.ceil(sticker / 2);
  const right = narrow ? 4 : 8;
  return {
    width: w,
    column,
    narrow,
    rowBase: narrow ? 96 : 132,
    caption: { size, line },
    sticker,
    pad: {
      top: 6,
      // Room for the sticker hanging off the next item's top-left corner: it sits on this padding, never on words.
      bottom: half + 2,
      right,
      left: half + 4,
      leftCaption: right,
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
  /** Photos when the record has any (with a caption beneath), else a label with its sticker. */
  variant: 'photo' | 'sticker';
  label: LabelStyle;
  /** Which start offset (an index into `OFFSET_STEPS`): never the item above's. */
  step: number;
  /** The label runs past the lane's right line by its offset, into an empty band of the next lane. */
  overhang: boolean;
  /** The photo cards, back to front: the newest of the shown ones on top. */
  fan: PhotoCard[];
  /** Photos beyond those shown: the top card's "+N". */
  morePhotos: number;
  /** Within the piece: the label, its words, the photo area, the sticker, the open slot. */
  labelBox: Box;
  textBox: Box;
  photoBox: Box | null;
  stickerBox: Box | null;
  slotBox: Box | null;
  /** The label's padding, as drawn. */
  pad: { top: number; right: number; bottom: number; left: number };
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

/** A piece's box moved onto the board. */
export function onBoard(piece: Pick<BoardPiece, 'x' | 'y'>, box: Box): Box {
  return { x: piece.x + box.x, y: piece.y + box.y, w: box.w, h: box.h };
}

/** True when two boxes share any area (touching edges do not). */
export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** What a day decides for each of its items before they are shaped. */
type Plan = { step: number; label: LabelStyle };

/**
 * A day's plan (review): the start offset steps by the id, never the same
 * as the item above's; a joint splash, where fills are drawn, alternates
 * white and ink with the day's other joint ones; everything else takes no
 * fill.
 */
function planDay(cards: Card[], fills: boolean): Plan[] {
  let step = -1;
  let fill: LabelStyle | null = null;
  return cards.map((card) => {
    const id = card.splash.id;
    const drawn = draw(id, 'offset', OFFSET_STEPS.length);
    step = drawn === step ? (drawn + 1) % OFFSET_STEPS.length : drawn;
    let label: LabelStyle = 'none';
    if (fills && card.joint) {
      const drawnFill: LabelStyle = draw(id, 'label', 2) === 0 ? 'white' : 'ink';
      fill = drawnFill === fill ? (fill === 'white' ? 'ink' : 'white') : drawnFill;
      label = fill;
    }
    return { step, label };
  });
}

/**
 * A piece's shape, its label running from its offset to the lane's right
 * line (overhang is decided later, by the lane beside it). A label carries
 * its sticker off its top-left corner — the label starting at least half a
 * sticker in, so the sticker never crosses into the lane before — and its
 * words start past the sticker's inner half. With photos, up to three
 * square cards from the offset to the line, the caption directly under
 * with its icon small before the words. An open joint splash's slot sits
 * under its label.
 */
function pieceShape(
  card: Card,
  plan: Plan,
  m: BoardMetrics,
): Omit<
  BoardPiece,
  'id' | 'card' | 'day' | 'week' | 'col' | 'label' | 'step' | 'overhang' | 'x' | 'y'
> {
  const id = card.splash.id;
  const photos = card.photos ?? [];
  const pictured = photos.length > 0;
  const half = Math.ceil(m.sticker / 2);
  const share = Math.round(m.column * OFFSET_STEPS[plan.step]);
  const offset = pictured ? share : Math.max(share, half);
  const pad = {
    top: m.pad.top,
    right: m.pad.right,
    bottom: m.pad.bottom,
    left: pictured ? m.pad.leftCaption : m.pad.left,
  };
  const labelW = m.column - offset;
  const caption =
    captionOf(card) +
    (card.joint ? ' '.repeat(FACES_CHARS) : '') +
    (pictured ? ' '.repeat(ICON_CHARS) : '');
  const chars = Math.max(
    2,
    Math.floor((labelW - pad.left - pad.right) / (m.caption.size * CHAR_EM)),
  );
  const lines = Math.min(CAPTION_LINES, Math.max(1, Math.ceil([...caption].length / chars)));
  const labelH = Math.max(LABEL_MIN_PX, pad.top + lines * m.caption.line + pad.bottom);

  let photoBox: Box | null = null;
  let fan: PhotoCard[] = [];
  let morePhotos = 0;
  if (pictured) {
    const shown = photos.slice(0, PHOTOS_SHOWN);
    let dy = 0;
    // Back to front: the last shown — the newest — is drawn last, on top.
    for (let at = shown.length - 1; at >= 0; at -= 1) {
      fan.push({ ...shown[at], dy });
      dy += m.fanMin + draw(id, `fan:${at}`, m.fanMax - m.fanMin + 1);
    }
    // `fan` is front to back; the deepest card's peek is the area's extra room.
    const spread = fan.length > 0 ? fan[fan.length - 1].dy : 0;
    // Whole pixels down the lane, so stacked boxes meet exactly and never creep into each other.
    photoBox = { x: offset, y: 0, w: labelW, h: Math.round(labelW) + spread };
    fan = fan.reverse();
    morePhotos = photos.length - shown.length;
  }
  const labelBox: Box = { x: offset, y: photoBox ? photoBox.h : 0, w: labelW, h: labelH };
  const slotBox: Box | null = isOpenJoint(card)
    ? { x: offset, y: labelBox.y + labelBox.h, w: labelW, h: SLOT_PX }
    : null;
  return {
    variant: pictured ? 'photo' : 'sticker',
    fan,
    morePhotos,
    labelBox,
    textBox: textOf(labelBox, pad, lines, m),
    photoBox,
    stickerBox: pictured
      ? null
      : { x: offset - m.sticker / 2, y: labelBox.y - m.sticker / 2, w: m.sticker, h: m.sticker },
    slotBox,
    pad,
    captionLines: lines,
    w: m.column,
    h: slotBox ? slotBox.y + slotBox.h : labelBox.y + labelBox.h,
  };
}

/** A label's words: inside its padding, as many lines as they take. */
function textOf(
  label: Box,
  pad: { top: number; right: number; left: number },
  lines: number,
  m: BoardMetrics,
): Box {
  return {
    x: label.x + pad.left,
    y: label.y + pad.top,
    w: label.w - pad.left - pad.right,
    h: lines * m.caption.line,
  };
}

/**
 * The board: lanes of days in rows, each post on its day, ranged posts as
 * bands along the top of each row they cross. A day's pieces stack down
 * its own lane in time order with no gap; a label overhangs the next lane
 * by its offset only where that lane is empty at its height; a row is as
 * tall as its tallest lane. Every choice comes from the post's id and its
 * place in its day (`planDay`).
 */
function layoutBoard(
  cards: Card[],
  rows: IsoDate[][],
  scope: { first: IsoDate; last: IsoDate },
  m: BoardMetrics,
  span: 'week' | 'month',
  fills: boolean,
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

    // Pieces: down their own lane, in time order, flush against each other.
    const rowPieces: BoardPiece[] = [];
    let tallest = span === 'month' ? m.rowBase : 0;
    for (const cell of cells) {
      const list = cell.inMonth ? (byDay.get(cell.day) ?? []) : [];
      let top = y + numberBand + tapeBlock;
      const plans = planDay(list, fills);
      list.forEach((card, at) => {
        const shape = pieceShape(card, plans[at], m);
        const piece: BoardPiece = {
          id: card.splash.id,
          card,
          day: cell.day,
          week: index,
          col: cell.col,
          label: plans[at].label,
          step: plans[at].step,
          overhang: false,
          ...shape,
          x: cell.x,
          y: top,
        };
        rowPieces.push(piece);
        top += shape.h;
      });
      tallest = Math.max(tallest, top - y, numberBand + tapeBlock);
    }

    // Overhang: a label with an offset reaches past its line by that offset
    // only where the next lane holds nothing at its height (its pieces and
    // their stickers, which hang above them).
    for (const piece of rowPieces) {
      if (piece.col === COLUMNS - 1 || piece.labelBox.x === 0) continue;
      const label = onBoard(piece, piece.labelBox);
      const reach: Box = { x: label.x + label.w, y: label.y, w: piece.labelBox.x, h: label.h };
      const neighbours = rowPieces.filter((p) => p.col === piece.col + 1);
      const clear = neighbours.every((p) => {
        const top = p.stickerBox ? Math.min(0, p.stickerBox.y) : 0;
        return !intersects(reach, { x: p.x, y: p.y + top, w: p.w, h: p.h - top });
      });
      if (!clear) continue;
      piece.overhang = true;
      piece.labelBox = { ...piece.labelBox, w: m.column };
      piece.textBox = textOf(piece.labelBox, piece.pad, piece.captionLines, m);
      piece.w = piece.labelBox.x + m.column;
    }
    pieces.push(...rowPieces);
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
    fills = false,
    weekStart = WEEK_START,
  }: { width: number; fills?: boolean; weekStart?: number },
): BoardLayout {
  const m = boardMetrics(width);
  const rows = monthDays(month, weekStart);
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const laid = layoutBoard(cards, rows, { first: `${month}-01`, last }, m, 'month', fills);
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
    fills = false,
    weekStart = WEEK_START,
  }: { width: number; fills?: boolean; weekStart?: number },
): BoardLayout {
  const m = boardMetrics(width);
  const first = weekOf(day, weekStart);
  const days = Array.from({ length: COLUMNS }, (_, i) => addDays(first, i));
  const laid = layoutBoard(cards, [days], { first, last: days[COLUMNS - 1] }, m, 'week', fills);
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
