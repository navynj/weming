/**
 * Two or three photos on the board, as a pile of prints (review, 2026-10-27):
 * the first — the first uploaded — at the recipe's size and on top; each one after
 * it at 65% of that width, underneath, set right and down by 35–45% of the
 * first photo's width and height, by hash, and further when that would hide
 * more than half of it; small stable tilts alternating either way. Every
 * photo keeps its own ratio, never cropped. One photo is laid as it was:
 * untilted, at the area's top-left. Pure: the layout calls it.
 */

export type SpreadInput = {
  path: string;
  /** Its width: the recipe's, or set by hand. Null for a following photo the recipe sizes. */
  size: number | null;
  /** Width over height; the placeholder's until it has loaded. */
  ratio: number;
};

export type SpreadCard = {
  path: string;
  size: number;
  /** Its box before its tilt, from the group's top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees; 0 for a lone photo. */
  tilt: number;
};

/** A following photo's width, as a share of the first's. */
export const FOLLOW = 0.65;
const OFFSET_MIN = 0.35;
const OFFSET_SPAN = 0.1;
/** Every photo shows at least this share of itself. */
export const MIN_VISIBLE = 0.5;
/**
 * What the spread aims for, measured untilted: the tilts turn corners back
 * under the photo above, most of all at a phone's small sizes, so the aim
 * leaves room for them and the drawn pile still shows half of each.
 */
const AIM_VISIBLE = 0.6;
const MAX_TILT = 4;

type Box = { x: number; y: number; w: number; h: number };

/**
 * Its box for a width: the height following its ratio, unless taller than
 * twice the width, when the whole image scales down to that height.
 */
export function photoBoxOf(size: number, ratio: number): { w: number; h: number } {
  const tall = size / ratio;
  if (tall <= size * 2) return { w: size, h: Math.round(tall) };
  const h = size * 2;
  return { w: Math.round(h * ratio), h };
}

/** How much of `box` no box in `over` covers, as a share of it (sampled). */
export function visibleShare(box: Box, over: Box[], steps = 24): number {
  let seen = 0;
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const px = box.x + ((i + 0.5) / steps) * box.w;
      const py = box.y + ((j + 0.5) / steps) * box.h;
      const covered = over.some(
        (o) => px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h,
      );
      if (!covered) seen += 1;
    }
  }
  return seen / (steps * steps);
}

/** The box around `box` turned `deg` about its centre. */
export function turned(box: Box, deg: number): Box {
  const t = (deg * Math.PI) / 180;
  const w = Math.abs(box.w * Math.cos(t)) + Math.abs(box.h * Math.sin(t));
  const h = Math.abs(box.w * Math.sin(t)) + Math.abs(box.h * Math.cos(t));
  return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
}

/**
 * The pile, front to back, from the group's top-left, and the group's size:
 * the box around every photo as turned, which is the item's photo area.
 * `hash(salt)` is the piece's stable draw in [0, 1).
 */
export function spreadPhotos(
  photos: SpreadInput[],
  firstSize: number,
  hash: (salt: string) => number,
): { cards: SpreadCard[]; w: number; h: number } {
  const first = photoBoxOf(firstSize, photos[0].ratio);
  const placed: SpreadCard[] = [
    { path: photos[0].path, size: firstSize, x: 0, y: 0, ...first, tilt: 0 },
  ];
  for (let at = 1; at < photos.length; at += 1) {
    const photo = photos[at];
    const size = photo.size ?? Math.round(firstSize * FOLLOW);
    const box = photoBoxOf(size, photo.ratio);
    const before = placed[at - 1];
    let fx = OFFSET_MIN + hash(`spread:x:${at}`) * OFFSET_SPAN;
    let fy = OFFSET_MIN + hash(`spread:y:${at}`) * OFFSET_SPAN;
    let x = before.x + fx * first.w;
    let y = before.y + fy * first.h;
    // Further out until at least half of it shows from under the ones above.
    for (
      let tries = 0;
      tries < 20 && visibleShare({ x, y, ...box }, placed) < AIM_VISIBLE;
      tries += 1
    ) {
      fx *= 1.1;
      fy *= 1.1;
      x = before.x + fx * first.w;
      y = before.y + fy * first.h;
    }
    placed.push({ path: photo.path, size, x: Math.round(x), y: Math.round(y), ...box, tilt: 0 });
  }
  if (placed.length > 1) {
    // Alternating either way, 1–4°, stable per piece.
    placed.forEach((card, at) => {
      const sign = at % 2 === 0 ? -1 : 1;
      card.tilt = sign * (1 + Math.floor(hash(`tilt:${at}`) * MAX_TILT));
    });
  }
  const bounds = placed.map((card) => turned(card, card.tilt));
  const left = Math.min(...bounds.map((b) => b.x));
  const top = Math.min(...bounds.map((b) => b.y));
  const right = Math.max(...bounds.map((b) => b.x + b.w));
  const bottom = Math.max(...bounds.map((b) => b.y + b.h));
  return {
    cards: placed.map((card) => ({
      ...card,
      x: Math.round(card.x - left),
      y: Math.round(card.y - top),
    })),
    w: Math.ceil(right - left),
    h: Math.ceil(bottom - top),
  };
}
