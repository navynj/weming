import type { Card } from '@/features/home/grid';
import { monthKey } from '@/features/splash/summary';
import type { IsoDate } from '@/lib/time';

/**
 * The month board's geometry (Board view, phase 1), in logical pixels at a
 * fixed width the frame scales to fit: the board is one composed artifact,
 * so it never reflows — a phone zooms into it instead.
 */
export const BOARD_PX = 980;
export const COLUMNS = 7;
export const COLUMN_PX = BOARD_PX / COLUMNS;
/** The first column's weekday: 0 is Sunday. */
export const WEEK_START = 0;

/** The title band and the weekday headers above the first week row. */
export const TITLE_PX = 104;
export const WEEKDAY_PX = 32;
export const HEAD_PX = TITLE_PX + WEEKDAY_PX;
/** A week row's least height; a busy day grows its whole row. */
export const ROW_BASE_PX = 120;
/** The day number's band at the top of a cell: nothing is placed over it. */
export const DAY_NUMBER_PX = 30;
/** A cell's inner margin, wide enough that a piece's rotation stays inside. */
export const CELL_PAD_PX = 10;
const FOOT_PX = 32;

export const TAPE_PX = 26;
const TAPE_GAP_PX = 4;
const TAPE_INSET_PX = 6;

/** Most a piece slips under the one above it. */
export const OVERLAP_MAX_PX = 12;
const OVERLAP_MIN_PX = 4;

/** A caption: 12px words on a 15px line, two lines at most. */
export const CAPTION_LINE_PX = 15;
const CAPTION_LINES = 2;

/**
 * A photo card's frame: at most this wide and this tall, its aspect clamped
 * between 4:5 and 5:4 once the image says what it is. Smaller than the spec's
 * ~160px long side, which is wider than a 140px column can hold with a fan.
 */
export const PHOTO_W_PX = 96;
export const PHOTO_H_PX = 116;
export const PHOTO_PAD_PX = 4;
/** At most this many photo cards; past it the top card carries "+N". */
export const PHOTOS_SHOWN = 3;
/** Each card behind the top one sits this much further up and right. */
const FAN_MIN_PX = 6;
const FAN_MAX_PX = 10;
/** How far the label rides up over the photos' bottom edge. */
export const LABEL_OVERLAP_PX = 14;
/** The sticker is the icon at 2.5x the caption's size, overhanging a corner of its label. */
export const STICKER_PX = 30;
export const STICKER_OVERHANG_PX = 12;
export const LABEL_PX = 108;
export const LABEL_PAD_TOP_PX = 12;
export const LABEL_PAD_BOTTOM_PX = 6;
/** How many caption characters one line holds, for the height estimate. */
const LABEL_CHARS = 13;
/** With photos the small icon leads the label's words. */
const ICON_CHARS = 2;
/** Room the joint faces take after a caption, in characters. */
const FACES_CHARS = 4;

/** A label's background: none (white words on the water), a white fill, or an ink fill. */
export type LabelStyle = 'none' | 'white' | 'ink';
export const LABEL_STYLES: readonly LabelStyle[] = ['none', 'white', 'ink'];
export type StickerCorner = 'left' | 'right';

/** A day of the board: its place, and whether it is the month's own. */
export type BoardCell = { day: IsoDate; inMonth: boolean; col: number; x: number };

export type BoardWeek = { index: number; y: number; h: number; cells: BoardCell[] };

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
  /** The label's box within the piece. */
  labelBox: { x: number; y: number; w: number };
  /** An open joint splash: the slot's top within the piece, under the label; null when complete or not joint. */
  slotY: number | null;
  corner: StickerCorner;
  rotate: number;
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
  rotate: number;
  /** Rightward and upward from the area's bottom-left corner. */
  dx: number;
  dy: number;
};

/** A ranged post: one strip per week row it touches, at the top of the row. */
export type BoardTape = {
  key: string;
  id: string;
  card: Card;
  week: number;
  startCol: number;
  endCol: number;
  rotate: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type BoardLayout = {
  month: string;
  title: string;
  weekdays: string[];
  width: number;
  height: number;
  weeks: BoardWeek[];
  pieces: BoardPiece[];
  tapes: BoardTape[];
};

/** FNV-1a: the stable seed every hand-placed choice comes from. */
export function seedOf(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A second, independent draw from the same id. */
function draw(id: string, salt: string, buckets: number): number {
  return seedOf(`${salt}:${id}`) % buckets;
}

/** -4 to 4 degrees, in tenths: hand-placed, and the same on every render. */
export function rotationOf(id: string): number {
  return (draw(id, 'rotate', 81) - 40) / 10;
}

/**
 * A label's style is rhythm, not meaning: drawn from the id, none : white :
 * ink at 4 : 3 : 3. `layoutMonthBoard` then mixes each cell (see `mixed`).
 */
export function labelStyleOf(id: string): LabelStyle {
  const roll = draw(id, 'label', 10);
  return roll < 4 ? 'none' : roll < 7 ? 'white' : 'ink';
}

/** The style after this one in the cycle: what a piece takes rather than repeat the one above it. */
export function nextLabelStyle(style: LabelStyle): LabelStyle {
  return LABEL_STYLES[(LABEL_STYLES.indexOf(style) + 1) % LABEL_STYLES.length];
}

/** The open slot under a joint splash's label: one line of faded faces, or "Add your side". */
export const SLOT_PX = 24;
const SLOT_GAP_PX = 2;

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

function addDays(day: IsoDate, n: number): IsoDate {
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

/** The month before or after `month`. */
export function shiftMonth(month: string, by: number): string {
  const at = new Date(`${month}-01T00:00:00Z`);
  at.setUTCMonth(at.getUTCMonth() + by);
  return at.toISOString().slice(0, 7);
}

/** The days on the board: whole weeks from the one holding the 1st to the one holding the last. */
function boardDays(month: string, weekStart: number): IsoDate[][] {
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  let day = addDays(first, -((weekdayIndex(first) - weekStart + 7) % 7));
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
  'w' | 'h' | 'captionLines' | 'fan' | 'morePhotos' | 'labelBox' | 'slotY'
>;

/** Room for the open slot, under the label, when the splash is waiting on someone. */
function withSlot(card: Card, shape: Omit<Shape, 'slotY'>): Shape {
  if (!isOpenJoint(card)) return { ...shape, slotY: null };
  return { ...shape, slotY: shape.h + SLOT_GAP_PX, h: shape.h + SLOT_GAP_PX + SLOT_PX };
}

const PIECE_W_PX = LABEL_PX + STICKER_OVERHANG_PX - 4;

/**
 * A piece's shape. With photos: up to three cards fanned up and to the right
 * from the bottom-left of a photo area tall enough for a portrait card, the
 * label riding over their bottom edge; without: the label, its sticker
 * overhanging a top corner.
 */
function pieceShape(card: Card, corner: StickerCorner, label: LabelStyle): Shape {
  return withSlot(card, bareShape(card, corner, label));
}

function bareShape(card: Card, corner: StickerCorner, label: LabelStyle): Omit<Shape, 'slotY'> {
  const id = card.splash.id;
  const photos = card.photos ?? [];
  const caption = captionOf(card) + (card.joint ? ' '.repeat(FACES_CHARS) : '');
  if (photos.length > 0) {
    const lines = linesFor(caption + ' '.repeat(ICON_CHARS), LABEL_CHARS);
    const shown = photos.slice(0, PHOTOS_SHOWN);
    let dx = 0;
    let dy = 0;
    const fan: PhotoCard[] = [];
    // Back to front: the last shown — the newest — is drawn last, on top.
    for (let at = shown.length - 1; at >= 0; at -= 1) {
      fan.push({ ...shown[at], rotate: rotationOf(`${id}:photo:${at}`), dx, dy });
      const step = FAN_MIN_PX + draw(id, `fan:${at}`, FAN_MAX_PX - FAN_MIN_PX + 1);
      dx += step;
      dy += step;
    }
    // `fan` is front to back; the deepest card's offset is the area's extra room.
    const spread = fan.length > 0 ? fan[fan.length - 1].dx : 0;
    // The frame includes its padding; the fan's spread is room above it.
    const area = PHOTO_H_PX + spread;
    const labelH = LABEL_PAD_BOTTOM_PX * 2 + lines * CAPTION_LINE_PX;
    // A filled label rides over the photos' bottom edge; words with no fill
    // would be lost on a photo, so they sit just under it, as a caption.
    const labelY = label === 'none' ? area : area - LABEL_OVERLAP_PX;
    return {
      w: PIECE_W_PX,
      h: labelY + labelH,
      captionLines: lines,
      fan: fan.reverse(),
      morePhotos: photos.length - shown.length,
      labelBox: { x: (PIECE_W_PX - LABEL_PX) / 2, y: labelY, w: LABEL_PX },
    };
  }
  const lines = linesFor(caption, LABEL_CHARS);
  return {
    w: PIECE_W_PX,
    h: STICKER_OVERHANG_PX + LABEL_PAD_TOP_PX + lines * CAPTION_LINE_PX + LABEL_PAD_BOTTOM_PX,
    captionLines: lines,
    fan: [],
    morePhotos: 0,
    labelBox: {
      x: corner === 'left' ? PIECE_W_PX - LABEL_PX : 0,
      y: STICKER_OVERHANG_PX,
      w: LABEL_PX,
    },
  };
}

/**
 * The month as a board: seven columns of days, each post on its day in a
 * variant chosen from the record itself, ranged posts as tapes along the
 * top of each week row they cross. Every choice — label style (mixed
 * within a cell), corner, rotation, offset, overlap, fan — comes from the
 * post's id and its place in its day, so the same month lays out the same
 * every time. A day's pieces stack down its own cell,
 * never into a neighbour's; a week row is as tall as its tallest cell.
 */
export function layoutMonthBoard(
  cards: Card[],
  month: string,
  weekStart: number = WEEK_START,
): BoardLayout {
  const weeks = boardDays(month, weekStart);
  const inMonth = (day: IsoDate): boolean => monthKey(day) === month;
  const firstDay = `${month}-01`;
  const lastDay = addDays(`${shiftMonth(month, 1)}-01`, -1);

  // A day's posts, oldest first; ranged posts set apart as tapes.
  const byDay = new Map<IsoDate, Card[]>();
  const ranged: Card[] = [];
  for (const card of cards) {
    const span = spanOf(card);
    if (span) {
      if (span.start <= lastDay && span.end >= firstDay) ranged.push(card);
      continue;
    }
    if (!inMonth(card.day)) continue;
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
  const rows: BoardWeek[] = [];
  let y = HEAD_PX;

  weeks.forEach((days, index) => {
    const cells: BoardCell[] = days.map((day, col) => ({
      day,
      inMonth: inMonth(day),
      col,
      x: col * COLUMN_PX,
    }));

    // Tapes: the range's days within this row and this month, packed into lanes.
    const ends: number[] = [];
    const rowTapes: Omit<BoardTape, 'y'>[] = [];
    const lanes: number[] = [];
    for (const card of ranged) {
      const span = spanOf(card)!;
      const cols = cells.filter((c) => c.inMonth && c.day >= span.start && c.day <= span.end);
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
        // Tapes lie flatter than pieces: a long strip at 4° would leave its row.
        rotate: rotationOf(`${card.splash.id}:${index}`) / 4,
        x: startCol * COLUMN_PX + TAPE_INSET_PX,
        w: (endCol - startCol + 1) * COLUMN_PX - TAPE_INSET_PX * 2,
        h: TAPE_PX,
      });
    }
    const tapeBlock = ends.length * (TAPE_PX + TAPE_GAP_PX);
    rowTapes.forEach((tape, at) => {
      tapes.push({ ...tape, y: y + DAY_NUMBER_PX + lanes[at] * (TAPE_PX + TAPE_GAP_PX) });
    });

    // Pieces: down their own cell, each slipping a little under the last.
    let tallest = ROW_BASE_PX;
    for (const cell of cells) {
      const list = cell.inMonth ? (byDay.get(cell.day) ?? []) : [];
      let top = y + DAY_NUMBER_PX + tapeBlock;
      // A cell is always mixed: a piece that would repeat the one above takes the next style.
      let above: LabelStyle | null = null;
      list.forEach((card, at) => {
        const id = card.splash.id;
        const variant = (card.photos?.length ?? 0) > 0 ? 'photo' : 'sticker';
        const corner: StickerCorner = draw(id, 'corner', 2) === 0 ? 'left' : 'right';
        const drawn = labelStyleOf(id);
        const label = drawn === above ? nextLabelStyle(drawn) : drawn;
        above = label;
        const shape = pieceShape(card, corner, label);
        const { w, h } = shape;
        const room = COLUMN_PX - CELL_PAD_PX * 2 - w;
        const overlap =
          at === 0 ? 0 : OVERLAP_MIN_PX + draw(id, 'overlap', OVERLAP_MAX_PX - OVERLAP_MIN_PX + 1);
        const nudge = at === 0 ? draw(id, 'nudge', 5) : 0;
        const pieceY = top - overlap + nudge;
        pieces.push({
          id,
          card,
          day: cell.day,
          week: index,
          col: cell.col,
          variant,
          label,
          corner,
          rotate: rotationOf(id),
          ...shape,
          x: cell.x + CELL_PAD_PX + (room > 0 ? draw(id, 'offset', room + 1) : 0),
          y: pieceY,
          w,
          h,
        });
        top = pieceY + h;
      });
      tallest = Math.max(tallest, top - y + CELL_PAD_PX, DAY_NUMBER_PX + tapeBlock + CELL_PAD_PX);
    }
    rows.push({ index, y, h: tallest, cells });
    y += tallest;
  });

  const weekdays = Array.from({ length: COLUMNS }, (_, i) => WEEKDAYS[(i + weekStart) % 7]);
  return {
    month,
    title: boardTitle(month),
    weekdays,
    width: BOARD_PX,
    height: y + FOOT_PX,
    weeks: rows,
    pieces,
    tapes,
  };
}
