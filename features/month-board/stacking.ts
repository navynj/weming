import { ORDER_MAX, type BoardLayoutJson } from './board-layout';
import { photoMove, type BoardPiece, type Box } from './layout';

/**
 * One stacking order for a whole board view (review, 2026-10-27): every
 * piece's parts are positioned children of one layer, with nothing between
 * that makes a stacking context, so a part's z competes with every other
 * piece's. A piece's place in the order is its hand-set layer first (0 when
 * unset), then the automatic order: earlier days under later ones, and
 * within a day the engine's order, in time. Within a piece its parts take
 * the post's own order (0055, `partRanks`): "Add your side" at the bottom,
 * then by default the label, the photos (the first uploaded on top), the
 * wave, the icon — or as moved in "Within this post".
 *
 * Replaces 0044's lift of every piece moved by hand above all in place,
 * which put a moved photo over the next day's sticker whatever was asked.
 */
/** Room for every part a post can have (ORDER_MAX), the slot under them and the ring over them. */
const STEP = ORDER_MAX + 3;
/** Under every part of its piece: "Add your side". */
export const SLOT_RANK = 0;
/** Over every part of its piece: the reading ring. */
export const RING_RANK = ORDER_MAX + 2;

/** A part's z: its piece's place, then its rank within the piece (`partRanks`). */
export function zOf(order: number, rank: number): number {
  return 1 + order * STEP + rank;
}

/** A post's parts as they are drawn, back to front, by default (0055). */
export function defaultPartOrder(present: {
  label: boolean;
  photos: string[];
  wave: boolean;
  icon: boolean;
}): string[] {
  return [
    ...(present.label ? ['label'] : []),
    // Back to front: the last uploaded at the back, the first on top.
    ...[...present.photos].reverse().map((path) => `photo:${path}`),
    ...(present.wave ? ['wave'] : []),
    ...(present.icon ? ['icon'] : []),
  ];
}

/**
 * The post's order (0055): the one saved, for the parts it now has, each
 * part it lacks put back where the default would have it — after the part
 * the default puts before it.
 */
export function partOrder(saved: readonly string[] | undefined, defaults: string[]): string[] {
  const present = new Set(defaults);
  const out = (saved ?? []).filter((key) => present.has(key));
  defaults.forEach((key, at) => {
    if (out.includes(key)) return;
    const before = defaults
      .slice(0, at)
      .reverse()
      .find((k) => out.includes(k));
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, key);
  });
  return out;
}

/** Each part's rank within its piece: 1 at the back, the slot under all (SLOT_RANK). */
export function partRanks(order: string[]): Map<string, number> {
  return new Map(order.map((key, at) => [key, at + 1]));
}

/** Above every piece of a view of `total`: a part held by a handle, then the frame and the toolbar. */
export function overAll(total: number, by: 1 | 2 | 3): number {
  return 1 + total * STEP + by * STEP;
}

/** A hand-set layer's range (0051): wide enough to go under or over every piece in a view. */
export const LAYER_RANGE = [-20, 20] as const;

export type LayerMove = 'forward' | 'backward' | 'front' | 'back';

/** A piece's layer moves as controls: each possible or not, and the move. */
export type LayerControls = { can: Record<LayerMove, boolean>; move: (how: LayerMove) => void };

export type Stacking = {
  /** Each piece's place, 0 at the bottom. */
  order: ReadonlyMap<string, number>;
  total: number;
  /** The layer a move gives the piece, or null when it would change nothing it overlaps. */
  move: (id: string, how: LayerMove) => number | null;
};

const rad = (deg: number | undefined): number => ((deg ?? 0) * Math.PI) / 180;

/** A box moved and turned about its centre, as the box around it. */
function turnedBox(box: Box, dx: number, dy: number, tilt: number | undefined): Box {
  const t = rad(tilt);
  const w = Math.abs(box.w * Math.cos(t)) + Math.abs(box.h * Math.sin(t));
  const h = Math.abs(box.w * Math.sin(t)) + Math.abs(box.h * Math.cos(t));
  const cx = box.x + dx + box.w / 2;
  const cy = box.y + dy + box.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Where a piece draws on the board: its label, sticker and photos as moved and turned by hand. */
export function extentOf(piece: BoardPiece, column: number): Box[] {
  const layout: BoardLayoutJson = piece.card.layout ?? {};
  const line = piece.type.line;
  const shift = layout.piece ?? {};
  const on = (box: Box, set: { x?: number; y?: number; tilt?: number } | undefined): Box =>
    turnedBox(
      { ...box, x: piece.x + box.x, y: piece.y + box.y },
      ((set?.x ?? 0) + (shift.x ?? 0)) * column,
      ((set?.y ?? 0) + (shift.y ?? 0)) * line,
      set?.tilt,
    );
  const boxes = [on(piece.labelBox, layout.label)];
  if (piece.stickerBox) boxes.push(on(piece.stickerBox, layout.icon));
  const area = piece.photoBox;
  if (area) {
    for (const photo of piece.fan) {
      const card = {
        x: area.x + photo.x,
        y: area.y + photo.y,
        w: photo.w,
        h: photo.h,
      };
      boxes.push(on(card, photoMove(layout.photos?.[photo.path], photo)));
    }
  }
  return boxes;
}

function meets(a: Box[], b: Box[]): boolean {
  return a.some((p) =>
    b.some(
      (q) =>
        p.x < q.x + q.w - 0.5 &&
        q.x < p.x + p.w - 0.5 &&
        p.y < q.y + q.h - 0.5 &&
        q.y < p.y + p.h - 0.5,
    ),
  );
}

/** The stacking order of a view's pieces, and what each layer move does. */
export function stackingOf(pieces: BoardPiece[], column: number): Stacking {
  // The automatic order: by day, then the engine's order within it (time).
  const auto = new Map(
    pieces
      .map((piece, at) => ({ id: piece.id, day: piece.day, at }))
      .sort((a, b) => (a.day === b.day ? a.at - b.at : a.day < b.day ? -1 : 1))
      .map((p, rank) => [p.id, rank]),
  );
  const layer = new Map(pieces.map((p) => [p.id, p.card.layout?.piece?.layer ?? 0]));
  const above = (a: string, b: string): boolean =>
    layer.get(a)! !== layer.get(b)! ? layer.get(a)! > layer.get(b)! : auto.get(a)! > auto.get(b)!;
  const sorted = [...pieces.map((p) => p.id)].sort((a, b) =>
    above(a, b) ? 1 : above(b, a) ? -1 : 0,
  );
  const order = new Map(sorted.map((id, at) => [id, at]));
  const extents = new Map(pieces.map((p) => [p.id, extentOf(p, column)]));
  const clampLayer = (v: number): number => Math.min(LAYER_RANGE[1], Math.max(LAYER_RANGE[0], v));

  const move = (id: string, how: LayerMove): number | null => {
    if (!order.has(id)) return null;
    const mine = extents.get(id)!;
    const others = sorted.filter((o) => o !== id && meets(mine, extents.get(o)!));
    const over = others.filter((o) => above(o, id));
    const under = others.filter((o) => above(id, o));
    const now = layer.get(id)!;
    const a = auto.get(id)!;
    let next: number;
    if (how === 'forward' || how === 'front') {
      if (over.length === 0) return null;
      // One step past the nearest above; or past every piece in the view.
      const pool = how === 'forward' ? [over[0]] : sorted.filter((o) => o !== id);
      const top = Math.max(...pool.map((o) => layer.get(o)!));
      const highest = Math.max(
        ...pool.filter((o) => layer.get(o) === top).map((o) => auto.get(o)!),
      );
      next = top + (a > highest ? 0 : 1);
    } else {
      if (under.length === 0) return null;
      const pool = how === 'backward' ? [under[under.length - 1]] : sorted.filter((o) => o !== id);
      const bottom = Math.min(...pool.map((o) => layer.get(o)!));
      const lowest = Math.min(
        ...pool.filter((o) => layer.get(o) === bottom).map((o) => auto.get(o)!),
      );
      next = bottom - (a < lowest ? 0 : 1);
    }
    next = clampLayer(next);
    return next === now ? null : next;
  };

  return { order, total: pieces.length, move };
}
