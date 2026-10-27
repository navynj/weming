import type { BoardLayoutJson } from './board-layout';

/**
 * Direct manipulation on the board (review, 2026-10-27): what a handle's
 * pixels mean in a layout's own units — X a share of the lane, Y in line
 * heights, tilts in degrees, sizes as the panel's sliders say them — so a
 * handle and a slider always write the same value.
 */

/** A part of a piece that can be selected: its label, its sticker, one photo, its wave. */
export type BoardPart =
  { kind: 'label' } | { kind: 'icon' } | { kind: 'photo'; path: string } | { kind: 'wave' };

export const LABEL_PART: BoardPart = { kind: 'label' };

export function samePart(a: BoardPart, b: BoardPart): boolean {
  return a.kind === b.kind && (a.kind !== 'photo' || a.path === (b as { path: string }).path);
}

/** The database's ranges (board_layout_valid), as the sliders hold them. */
export const LIMITS = {
  x: [-3, 3],
  y: [-20, 20],
  tilt: [-45, 45],
  iconSize: [0.5, 8],
  photoSize: [0.2, 2],
  span: [0.2, 4],
  fontSize: [10, 18],
  width: [0.3, 4],
} as const satisfies Record<string, readonly [number, number]>;

/** A turn within this many degrees of straight is straight. */
export const TILT_SNAP_DEG = 3;
/** One arrow press: the sliders' own steps. Shift is ten. */
export const KEY_STEP = { x: 0.01, y: 0.1, tilt: 1 } as const;

export function clamp(v: number, [lo, hi]: readonly [number, number]): number {
  return Math.min(hi, Math.max(lo, v));
}
function round(v: number, places: number): number {
  const out = Number(v.toFixed(places));
  return out === 0 ? 0 : out;
}

/** A part's hand-set values, whichever part it is. */
export type PartValues = {
  x?: number;
  y?: number;
  tilt?: number;
  size?: number;
  span?: number;
  /** A label's width, in column widths (0027, 0050). */
  width?: number;
};

export function partValues(layout: BoardLayoutJson, part: BoardPart): PartValues {
  switch (part.kind) {
    case 'label':
      return {
        x: layout.label?.x,
        y: layout.label?.y,
        tilt: layout.label?.tilt,
        width: layout.label?.width,
      };
    case 'icon':
      return { ...layout.icon };
    case 'photo':
      return { ...layout.photos?.[part.path] };
    case 'wave':
      return {
        x: layout.wave?.x,
        y: layout.wave?.y,
        tilt: layout.wave?.tilt,
        span: layout.wave?.span,
      };
  }
}

/** The patch that sets these values on this part; only the fields given, and only its own. */
export function partPatch(part: BoardPart, values: PartValues): BoardLayoutJson {
  const pick = <K extends keyof PartValues>(keys: K[]): Pick<PartValues, K> =>
    Object.fromEntries(
      keys.filter((k) => values[k] !== undefined).map((k) => [k, values[k]]),
    ) as Pick<PartValues, K>;
  switch (part.kind) {
    case 'label':
      return { label: pick(['x', 'y', 'tilt', 'width']) };
    case 'icon':
      return { icon: pick(['x', 'y', 'tilt', 'size']) };
    case 'photo':
      return { photos: { [part.path]: pick(['x', 'y', 'tilt', 'size']) } };
    case 'wave':
      return { wave: pick(['x', 'y', 'tilt', 'span']) };
  }
}

/** A drag of the body: the pixels it travelled, from where it started. */
export function moved(
  start: PartValues,
  dx: number,
  dy: number,
  column: number,
  line: number,
): { x: number; y: number } {
  return {
    x: clamp(round((start.x ?? 0) + dx / column, 3), LIMITS.x),
    y: clamp(round((start.y ?? 0) + dy / line, 2), LIMITS.y),
  };
}

/** Where a point lies from a centre, in degrees, as CSS turns: clockwise from the right. */
export function angleOf(center: { x: number; y: number }, point: { x: number; y: number }): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

/** Straight within 3 degrees (review): a turn nearly undone is undone. */
export function snapTilt(deg: number): number {
  return Math.abs(deg) <= TILT_SNAP_DEG ? 0 : deg;
}

/** A turn by the rotate handle, or a twist: by how far the angle moved since the start. */
export function turned(startTilt: number | undefined, from: number, to: number): number {
  let by = to - from;
  while (by > 180) by -= 360;
  while (by <= -180) by += 360;
  return snapTilt(clamp(Math.round((startTilt ?? 0) + by), LIMITS.tilt));
}

/**
 * A corner pulled, or a pinch: the size it started at, in pixels, times how
 * much further out the finger is, said in the field's unit — a sticker in
 * the board's line heights, a photo as a share of the lane.
 */
export function resized(
  kind: 'icon' | 'photo',
  startPx: number,
  ratio: number,
  unitPx: number,
): number {
  return clamp(
    round((startPx * ratio) / unitPx, 2),
    kind === 'icon' ? LIMITS.iconSize : LIMITS.photoSize,
  );
}

type Point = { x: number; y: number };

/**
 * A sticker's or photo's corner pulled (review): the opposite corner held,
 * the pulled one following the finger one to one. The finger's travel is
 * added to where the corner was, projected on the box's diagonal from the
 * held corner, and read against that diagonal: so a 20px pull on a 100px
 * photo makes it 120px, not a multiple of the pull.
 */
export function cornerSized(startPx: number, anchor: Point, corner: Point, travel: Point): number {
  const dx = corner.x - anchor.x;
  const dy = corner.y - anchor.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return startPx;
  const along = (corner.x + travel.x - anchor.x) * dx + (corner.y + travel.y - anchor.y) * dy;
  return Math.max(0, (startPx * along) / len2);
}

/**
 * A point of a square box given as a share of it from its top-left — (0, 0)
 * the corner itself, (0.5, 0.5) its middle — the box read from its top-left
 * and bottom-right corners on screen, turned however it is.
 */
export function pointOn(topLeft: Point, bottomRight: Point, at: Point): Point {
  const dx = bottomRight.x - topLeft.x;
  const dy = bottomRight.y - topLeft.y;
  const side = Math.hypot(dx, dy) / Math.SQRT2;
  const turn = Math.atan2(dy, dx) - Math.PI / 4;
  const u = { x: Math.cos(turn), y: Math.sin(turn) };
  const v = { x: -Math.sin(turn), y: Math.cos(turn) };
  return {
    x: topLeft.x + side * (at.x * u.x + at.y * v.x),
    y: topLeft.y + side * (at.x * u.y + at.y * v.y),
  };
}

/** Where a point on screen lies in such a box, as a share of it: pointOn's inverse. */
export function shareOf(topLeft: Point, bottomRight: Point, p: Point): Point {
  const dx = bottomRight.x - topLeft.x;
  const dy = bottomRight.y - topLeft.y;
  const side = Math.hypot(dx, dy) / Math.SQRT2;
  if (side === 0) return { x: 0, y: 0 };
  const turn = Math.atan2(dy, dx) - Math.PI / 4;
  const rx = p.x - topLeft.x;
  const ry = p.y - topLeft.y;
  return {
    x: (rx * Math.cos(turn) + ry * Math.sin(turn)) / side,
    y: (-rx * Math.sin(turn) + ry * Math.cos(turn)) / side,
  };
}

/**
 * The part's offset taken back by how far the point it is held at has
 * drifted on screen (review): a size change draws the box from its own
 * place, so the held corner — or a pinch's midpoint — would move without it.
 */
export function heldAt(
  values: PartValues,
  drift: Point,
  column: number,
  line: number,
): { x: number; y: number } {
  return {
    x: clamp(round((values.x ?? 0) - drift.x / column, 3), LIMITS.x),
    y: clamp(round((values.y ?? 0) - drift.y / line, 2), LIMITS.y),
  };
}

/** A label's right edge pulled `along` pixels on its own axis: its width in column widths. */
export function widened(startPx: number, along: number, column: number): number {
  return clamp(round((startPx + along) / column, 2), LIMITS.width);
}

/** The wave's right end pulled `along` pixels on its own axis: its length a share of the label. */
export function spanned(startSpan: number, along: number, labelW: number): number {
  return clamp(round(startSpan + along / labelW, 2), LIMITS.span);
}

/**
 * The wave's left end pulled: longer or shorter by as much as the end moved
 * along the wave, its start following, so the right end stays where it was.
 */
export function spannedFromLeft(
  start: { x?: number; y?: number; span: number; tilt?: number },
  along: number,
  labelW: number,
  column: number,
  line: number,
): { x: number; y: number; span: number } {
  const span = spanned(start.span, -along, labelW);
  const travelled = (start.span - span) * labelW;
  const rad = ((start.tilt ?? 0) * Math.PI) / 180;
  return {
    span,
    x: clamp(round((start.x ?? 0) + (travelled * Math.cos(rad)) / column, 3), LIMITS.x),
    y: clamp(round((start.y ?? 0) + (travelled * Math.sin(rad)) / line, 2), LIMITS.y),
  };
}

/** A pixel delta read along a line turned by `tilt`: how far it travelled down the wave. */
export function alongTilt(dx: number, dy: number, tilt: number | undefined): number {
  const rad = ((tilt ?? 0) * Math.PI) / 180;
  return dx * Math.cos(rad) + dy * Math.sin(rad);
}

/**
 * The keyboard on a selected part (desktop): arrows move by a slider's
 * step, ten with Shift; [ and ] turn by a degree, never snapped, so a turn
 * can leave straight one degree at a time. Null for any other key.
 */
export function nudged(values: PartValues, key: string, shift: boolean): PartValues | null {
  const by = shift ? 10 : 1;
  const x = values.x ?? 0;
  const y = values.y ?? 0;
  const tilt = values.tilt ?? 0;
  switch (key) {
    case 'ArrowLeft':
      return { x: clamp(round(x - KEY_STEP.x * by, 3), LIMITS.x) };
    case 'ArrowRight':
      return { x: clamp(round(x + KEY_STEP.x * by, 3), LIMITS.x) };
    case 'ArrowUp':
      return { y: clamp(round(y - KEY_STEP.y * by, 2), LIMITS.y) };
    case 'ArrowDown':
      return { y: clamp(round(y + KEY_STEP.y * by, 2), LIMITS.y) };
    case '[':
      return { tilt: clamp(tilt - KEY_STEP.tilt, LIMITS.tilt) };
    case ']':
      return { tilt: clamp(tilt + KEY_STEP.tilt, LIMITS.tilt) };
    default:
      return null;
  }
}

/** The text size stepper: a point a press, 10 to 18. */
export function stepFont(size: number, by: 1 | -1): number {
  return clamp(Math.round(size) + by, LIMITS.fontSize);
}

const PHOTO_FIELD = /^photos\.(.+)\.(size|x|y|tilt|hidden)$/;

/** The dotted paths a save touched: every field its patch set, and every path it cleared. */
export function pathsOf(patch: BoardLayoutJson, clear: string[]): string[] {
  const out = new Set<string>();
  for (const group of ['piece', 'icon', 'label', 'wave'] as const) {
    for (const field of Object.keys(patch[group] ?? {})) out.add(`${group}.${field}`);
  }
  for (const [path, value] of Object.entries(patch.photos ?? {})) {
    for (const field of Object.keys(value)) out.add(`photos.${path}.${field}`);
  }
  for (const path of clear) out.add(path);
  return [...out];
}

/** What a layout holds at a dotted path, as clearLayout reads them. */
export function valueAt(layout: BoardLayoutJson, path: string): unknown {
  const photo = PHOTO_FIELD.exec(path);
  if (photo) return (layout.photos?.[photo[1]] as Record<string, unknown> | undefined)?.[photo[2]];
  if (path === 'photos') return layout.photos;
  if (path.startsWith('photos.')) return layout.photos?.[path.slice(7)];
  const [group, field] = path.split('.') as [keyof BoardLayoutJson, string | undefined];
  const set = layout[group] as Record<string, unknown> | undefined;
  return field === undefined ? set : set?.[field];
}

/**
 * Undo (review): the write that puts these paths back as they were — each
 * one that held a value set to it again, each that was the recipe's
 * cleared — so a field that was Auto is Auto again, not a copy of it.
 */
export function restoring(
  before: BoardLayoutJson,
  paths: string[],
): { patch: BoardLayoutJson; clear: string[] } {
  const patch: BoardLayoutJson = {};
  const clear: string[] = [];
  const into = patch as Record<string, Record<string, unknown>>;
  for (const path of paths) {
    const value = valueAt(before, path);
    if (value === undefined) {
      clear.push(path);
      continue;
    }
    const photo = PHOTO_FIELD.exec(path);
    if (photo) {
      const photos = (patch.photos ??= {});
      photos[photo[1]] = { ...photos[photo[1]], [photo[2]]: value };
    } else if (path === 'photos') {
      patch.photos = structuredClone(value as NonNullable<BoardLayoutJson['photos']>);
    } else if (path.startsWith('photos.')) {
      const photos = (patch.photos ??= {});
      photos[path.slice(7)] = structuredClone(value as Record<string, unknown>);
    } else {
      const [group, field] = path.split('.');
      into[group] =
        field === undefined
          ? { ...into[group], ...(value as Record<string, unknown>) }
          : { ...into[group], [field]: value };
    }
  }
  return { patch, clear };
}
