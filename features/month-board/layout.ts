import type { Card } from '@/features/home/grid';
import { monthKey } from '@/features/splash/summary';
import type { IsoDate } from '@/lib/time';

import { seedOf } from './layout-seed';

export { seedOf };

/**
 * The board's geometry (Board view), in logical pixels. The board is laid
 * out at its room's own width, phone or desktop, and never scaled or
 * panned (review): seven columns always fit, and the sizes around the type
 * — labels, stickers, photos — follow the column while the type keeps to
 * the app's floor. Labels fill their lane edge to edge (review, the
 * mockup): square, straight, stacked with no gap, in time order. One
 * width, one board: the same data at the same width always lays out the
 * same.
 */
export const COLUMNS = 7;
/** The first column's weekday: 0 is Sunday. */
export const WEEK_START = 0;
/**
 * A week's column header: the weekday over the day number, centred, and
 * the day's waves beneath — one line per record, three at most.
 */
export const HEADER_PX = 72;
/** A month's column header carries only the weekday names. */
export const MONTH_HEADER_PX = 28;
/** A month cell's day number and waves, at the top of the cell: nothing is placed over it. */
export const DAY_NUMBER_PX = 46;
/** How many wave lines a day shows at most. */
export const DAY_WAVES_MAX = 3;
const FOOT_PX = 24;
/** The one gap in a lane: between a photo card and the item after it. */
const AFTER_PHOTO_GAP_PX = 6;

const CAPTION_LINES = 3;

/** A range band's height, and the lanes bands pack into. */
export const TAPE_PX = 24;
const TAPE_GAP_PX = 2;

/** At most this many photo cards; past it the top card carries "+N". */
export const PHOTOS_SHOWN = 3;
/** An offset label starts this far into its lane (review, the first mockup's dynamics). */
const OFFSET_MIN = 0.25;
const OFFSET_MAX = 0.4;
/** A photo card's width, as a share of the lane. */
const PHOTO_MIN = 0.7;
const PHOTO_MAX = 0.85;
/** A large sticker is this many label heights, centred on the label's top corner. */
export const STICKER_LARGE = 1.8;
/** A small sticker leads the label's words, at their height. */
const ICON_CHARS = 2;
/** Room the joint faces take after a caption, in characters. */
const FACES_CHARS = 4;

/**
 * A label's background: a white fill or an ink fill, alternating within a
 * day; none (white words on the water) is a photo caption's alone (review).
 */
export type LabelStyle = 'none' | 'white' | 'ink';
export const LABEL_STYLES: readonly LabelStyle[] = ['none', 'white', 'ink'];
/**
 * Where a label starts: flush at its lane's left line, or offset a quarter
 * to two fifths into the lane, the lane wide still, so it overhangs the
 * next — never twice in a row within a day.
 */
export type Placement = 'flush' | 'offset';
/** A sticker: large, centred on the label's top-left or top-right corner, or small before the words. */
export type Sticker = { size: 'large'; corner: 'tl' | 'tr' } | { size: 'small' };

/** The sizes that follow the board's width. */
export type BoardMetrics = {
  width: number;
  column: number;
  /** A phone's columns (under 80px): smaller type and stickers. */
  narrow: boolean;
  /** A month row's least height; a busy day grows its whole row. A week row has none. */
  rowBase: number;
  /** The caption's type: its size, its line, and about how many characters a line holds. */
  caption: { size: number; line: number; chars: number };
  labelPadX: number;
  labelPadY: number;
  /** A small sticker's size: the words' height. */
  sticker: number;
  /** Each card behind the top one peeks this much above the one before. */
  fanMin: number;
  fanMax: number;
};

/** The metrics at a width. */
export function boardMetrics(width: number): BoardMetrics {
  const w = Math.max(COLUMNS * 40, Math.round(width));
  const column = w / COLUMNS;
  const narrow = column < 80;
  // Every splash title on the calendar is 10px, the app's floor (review);
  // about 0.55em per character of Poppins, for the line estimate.
  const size = 10;
  const labelPadX = narrow ? 6 : 10;
  return {
    width: w,
    column,
    narrow,
    rowBase: narrow ? 96 : 132,
    caption: {
      size,
      line: size + 3,
      chars: Math.max(3, Math.floor((column - labelPadX * 2) / (size * 0.55))),
    },
    labelPadX,
    labelPadY: narrow ? 4 : 6,
    sticker: size + 4,
    fanMin: narrow ? 3 : 4,
    fanMax: narrow ? 5 : 8,
  };
}

/** A day of the board: its place, whether it is the month's own (every day of a week is), and how many records it holds. */
export type BoardCell = { day: IsoDate; inMonth: boolean; col: number; x: number; count: number };

export type BoardWeek = { index: number; y: number; h: number; cells: BoardCell[] };

/** A box within a piece. */
export type Box = { x: number; y: number; w: number; h: number };

/** A post placed on its day (written_on, or its one declared day). */
export type BoardPiece = {
  id: string;
  card: Card;
  day: IsoDate;
  week: number;
  col: number;
  /** Photos when the record has any (alongside its label), else a sticker on the label. */
  variant: 'photo' | 'sticker';
  label: LabelStyle;
  /** The photo cards, back to front: the newest of the shown ones on top. */
  fan: PhotoCard[];
  /** Photos beyond those shown: the top card's "+N". */
  morePhotos: number;
  /** The label's box within the piece: flush at the lane's line, or offset into it. */
  labelBox: Box;
  placement: Placement;
  /** With photos, the photo area's box: the fan sits on its bottom edge, the label directly under. */
  photoBox: Box | null;
  /** An open joint splash: the slot sits to the label's right. */
  slot: boolean;
  /** Its icon, large on a corner or small before the words; none with photos (the icon leads the caption). */
  sticker: Sticker | null;
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
  /** The range begins in this row: the band's start is rounded. Else it runs in from the row before. */
  startsHere: boolean;
  /** The range ends in this row: the band's end is rounded. Else it runs on into the next. */
  endsHere: boolean;
};

export type BoardLayout = {
  span: 'week' | 'month';
  metrics: BoardMetrics;
  /** `YYYY-MM` for a month; the first day for a week. */
  key: string;
  title: string;
  /** The column headers: the weekday names for a month, `12 MON` for a week. */
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

/** A draw in [0, 1). */
function unit(id: string, salt: string): number {
  return seedOf(`${salt}:${id}`) / 0x100000000;
}

/** A joint splash still waiting on a current member: its label carries the open slot (meaning is shape). */
export function isOpenJoint(card: Card): boolean {
  return card.joint === true && (card.awaiting?.length ?? 0) > 0;
}

export function captionOf(card: Card): string {
  return card.splash.title.trim() || card.splash.ghostTitle || 'Untitled';
}

function linesFor(text: string, perLine: number): number {
  return Math.min(CAPTION_LINES, Math.max(1, Math.ceil([...text].length / perLine)));
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

type Shape = Pick<
  BoardPiece,
  'w' | 'h' | 'captionLines' | 'fan' | 'morePhotos' | 'labelBox' | 'photoBox' | 'slot'
>;

/** What a day decides for each of its items before they are shaped. */
type Plan = { placement: Placement; label: LabelStyle; sticker: Sticker | null };

/**
 * A piece's shape. The label is the lane wide, flush at the lane's line or
 * offset into it (the lane's last keeps to the board's edge rather than
 * past it); with photos, up to three square cards seven to eight and a
 * half tenths of the lane wide, left or right, peeking one above the next,
 * the caption directly under them. A large sticker adds no height: it
 * overhangs. An open joint splash's slot sits to the label's right.
 */
function pieceShape(card: Card, plan: Plan, col: number, m: BoardMetrics): Shape {
  const id = card.splash.id;
  const photos = card.photos ?? [];
  const slot = isOpenJoint(card);
  const inline = plan.sticker?.size === 'small' || photos.length > 0;
  const caption =
    captionOf(card) +
    (card.joint ? ' '.repeat(FACES_CHARS) : '') +
    (inline ? ' '.repeat(ICON_CHARS) : '');
  const lines = linesFor(caption, m.caption.chars);
  const start =
    plan.placement === 'offset'
      ? Math.round(m.column * (OFFSET_MIN + unit(id, 'offset') * (OFFSET_MAX - OFFSET_MIN)))
      : 0;
  // The lane wide; in the last lane an offset label ends at the board's edge.
  const labelW = col === COLUMNS - 1 ? m.column - start : m.column;
  const labelH = m.labelPadY * 2 + lines * m.caption.line;
  if (photos.length > 0) {
    const shown = photos.slice(0, PHOTOS_SHOWN);
    let dy = 0;
    const fan: PhotoCard[] = [];
    // Back to front: the last shown — the newest — is drawn last, on top.
    for (let at = shown.length - 1; at >= 0; at -= 1) {
      fan.push({ ...shown[at], dy });
      dy += m.fanMin + draw(id, `fan:${at}`, m.fanMax - m.fanMin + 1);
    }
    // `fan` is front to back; the deepest card's peek is the area's extra room.
    const spread = fan.length > 0 ? fan[fan.length - 1].dy : 0;
    const photoW = Math.round(m.column * (PHOTO_MIN + unit(id, 'photo') * (PHOTO_MAX - PHOTO_MIN)));
    const photoBox: Box = {
      x: draw(id, 'align', 2) === 0 ? 0 : m.column - photoW,
      y: 0,
      w: photoW,
      h: photoW + spread,
    };
    return {
      w: start + labelW,
      h: photoBox.h + labelH,
      captionLines: lines,
      fan: fan.reverse(),
      morePhotos: photos.length - shown.length,
      labelBox: { x: start, y: photoBox.h, w: labelW, h: labelH },
      photoBox,
      slot,
    };
  }
  return {
    w: start + labelW,
    h: labelH,
    captionLines: lines,
    fan: [],
    morePhotos: 0,
    labelBox: { x: start, y: 0, w: labelW, h: labelH },
    photoBox: null,
    slot,
  };
}

/**
 * A day's plan (review): placements alternate, flush and offset, from the
 * id's first; fills alternate, white and ink, a photo's caption taking
 * none; stickers are large or small by the id, the first item's small
 * (a large one there would cover the header), and a day of two or more
 * items has at least one large.
 */
function planDay(cards: Card[]): Plan[] {
  let placement: Placement | null = null;
  let fill: LabelStyle | null = null;
  const plans: Plan[] = cards.map((card, at) => {
    const id = card.splash.id;
    const pictured = (card.photos?.length ?? 0) > 0;
    const drawnPlacement: Placement = draw(id, 'placement', 2) === 0 ? 'flush' : 'offset';
    placement =
      drawnPlacement === placement ? (placement === 'flush' ? 'offset' : 'flush') : drawnPlacement;
    let label: LabelStyle = 'none';
    if (!pictured) {
      const drawnFill: LabelStyle = draw(id, 'label', 2) === 0 ? 'white' : 'ink';
      fill = drawnFill === fill ? (fill === 'white' ? 'ink' : 'white') : drawnFill;
      label = fill;
    }
    const sticker: Sticker | null = pictured
      ? null
      : at > 0 && draw(id, 'sticker', 2) === 0
        ? { size: 'large', corner: draw(id, 'corner', 2) === 0 ? 'tl' : 'tr' }
        : { size: 'small' };
    return { placement, label, sticker };
  });
  if (cards.length >= 2 && !plans.some((p) => p.sticker?.size === 'large')) {
    const at = plans.findIndex((p, i) => i > 0 && p.sticker?.size === 'small');
    if (at > 0) {
      plans[at] = {
        ...plans[at],
        sticker: {
          size: 'large',
          corner: draw(cards[at].splash.id, 'corner', 2) === 0 ? 'tl' : 'tr',
        },
      };
    }
  }
  return plans;
}

/**
 * The board: columns of days in rows, each post on its day in a variant
 * chosen from the record itself, ranged posts as bands along the top of
 * each row they cross. Every choice — placement, fill, sticker, fan —
 * comes from the post's id and its place in its day (`planDay`), so the
 * same data at the same width lays out the same every time. A day's pieces
 * stack down its own lane in time order with no gap between them (one
 * breath after a photo card); an offset one overhangs the next lane; a row
 * is as tall as its tallest lane.
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
  // A week's columns carry their day in the header; a month's cells number themselves.
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
      const key = `${card.splash.id}:${index}`;
      rowTapes.push({
        key,
        id: card.splash.id,
        card,
        week: index,
        startCol,
        endCol,
        // Where the range truly starts and ends, against where it runs on
        // into another row, or another page.
        startsHere: cols[0].day === range.start,
        endsHere: cols[cols.length - 1].day === range.end,
        // The full width of its lanes, edge to edge.
        x: startCol * m.column,
        w: (endCol - startCol + 1) * m.column,
        h: TAPE_PX,
      });
    }
    const tapeBlock = ends.length * (TAPE_PX + TAPE_GAP_PX);
    rowTapes.forEach((tape, at) => {
      tapes.push({ ...tape, y: y + numberBand + lanes[at] * (TAPE_PX + TAPE_GAP_PX) });
    });

    // Pieces: down their own lane, in time order, directly under the header
    // (or the bands), each flush against the last.
    let tallest = span === 'month' ? m.rowBase : 0;
    for (const cell of cells) {
      const list = cell.inMonth ? (byDay.get(cell.day) ?? []) : [];
      let top = y + numberBand + tapeBlock;
      const plans = planDay(list);
      list.forEach((card, at) => {
        const id = card.splash.id;
        const variant = (card.photos?.length ?? 0) > 0 ? 'photo' : 'sticker';
        const plan = plans[at];
        const shape = pieceShape(card, plan, cell.col, m);
        pieces.push({
          id,
          card,
          day: cell.day,
          week: index,
          col: cell.col,
          variant,
          label: plan.label,
          placement: plan.placement,
          sticker: plan.sticker,
          ...shape,
          x: cell.x,
          y: top,
        });
        top += shape.h + (variant === 'photo' ? AFTER_PHOTO_GAP_PX : 0);
      });
      tallest = Math.max(tallest, top - y, numberBand + tapeBlock);
    }
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

/** One week (the default): seven full-height lanes headed `12 MON`, the week's range as the title. */
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
