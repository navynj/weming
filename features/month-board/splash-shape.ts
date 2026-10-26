import { seedOf } from './layout-seed';

/**
 * A board label as a splash (Board view, review): a rounded-rectangle text
 * box whose outline wobbles gently, the drops thrown off its edge, and the
 * rings it sends out beneath — every number drawn from the splash's id, so
 * the same splash makes the same splash on every render. Computed once per
 * splash and size, and kept.
 */
export type SplashShape = {
  /** The outline, around a box at (0, 0) of the label's size; null when the label has no fill. */
  blob: string | null;
  /** Small drops just outside the edge, in the label's own coordinates. */
  droplets: { cx: number; cy: number; r: number }[];
  /** Thin rings centred under the box, one per ripple (three at most), innermost first. */
  rings: { cx: number; cy: number; rx: number; ry: number }[];
};

/** How far the edge wobbles, and how many lobes run around it. */
const AMP_MIN = 2;
const AMP_MAX = 3;
const LOBES_MIN = 6;
const LOBES_MAX = 9;
/** The text box's corner, before the wobble. */
const CORNER_PX = 10;
/** Points sampled around the perimeter: plenty for nine lobes, cheap to smooth. */
const SAMPLES = 54;
/** Rings: at most three, each 6px further out below than the last, half that at the sides. */
const RINGS_MAX = 3;
const RING_STEP_PX = 6;
const RING_BELOW_PX = 4;
const RING_SIDE_PX = 3;

/** A draw in [0, 1) from the id and a salt. */
function unit(id: string, salt: string): number {
  return seedOf(`${salt}:${id}`) / 0x100000000;
}

/** The point and outward normal at distance `s` along a rounded rectangle's perimeter. */
function perimeterAt(
  s: number,
  w: number,
  h: number,
  r: number,
): { x: number; y: number; nx: number; ny: number } {
  const straightW = w - 2 * r;
  const straightH = h - 2 * r;
  const arc = (Math.PI / 2) * r;
  // Clockwise from the top edge's left end.
  const legs: [number, (t: number) => { x: number; y: number; nx: number; ny: number }][] = [
    [straightW, (t) => ({ x: r + t, y: 0, nx: 0, ny: -1 })],
    [arc, (t) => corner(w - r, r, -Math.PI / 2 + t / r)],
    [straightH, (t) => ({ x: w, y: r + t, nx: 1, ny: 0 })],
    [arc, (t) => corner(w - r, h - r, t / r)],
    [straightW, (t) => ({ x: w - r - t, y: h, nx: 0, ny: 1 })],
    [arc, (t) => corner(r, h - r, Math.PI / 2 + t / r)],
    [straightH, (t) => ({ x: 0, y: h - r - t, nx: -1, ny: 0 })],
    [arc, (t) => corner(r, r, Math.PI + t / r)],
  ];
  let left = s;
  for (const [length, at] of legs) {
    if (left <= length) return at(left);
    left -= length;
  }
  return legs[0][1](0);

  function corner(cx: number, cy: number, angle: number) {
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    return { x: cx + nx * r, y: cy + ny * r, nx, ny };
  }
}

function perimeterOf(w: number, h: number, r: number): number {
  return 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
}

/** A closed Catmull-Rom curve through the points, as cubic Béziers. */
function smoothPath(points: { x: number; y: number }[]): string {
  const n = points.length;
  const f = (v: number): string => v.toFixed(1);
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    d += `C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return `${d}Z`;
}

const kept = new Map<string, SplashShape>();

/**
 * The splash for a label of `w` by `h`: an outline when it has a fill, two
 * or three drops, and `ripples` rings (three at most). Memoized by id, size,
 * fill and count: the shape layer is computed once per splash.
 */
export function splashShape(
  id: string,
  w: number,
  h: number,
  { filled, ripples }: { filled: boolean; ripples: number },
): SplashShape {
  const key = `${id}|${w}|${h}|${filled ? 1 : 0}|${ripples}`;
  const hit = kept.get(key);
  if (hit) return hit;

  const amp = AMP_MIN + unit(id, 'amp') * (AMP_MAX - AMP_MIN);
  const lobes = LOBES_MIN + Math.floor(unit(id, 'lobes') * (LOBES_MAX - LOBES_MIN + 1));
  const phase = unit(id, 'phase') * Math.PI * 2;
  const r = Math.min(CORNER_PX, h / 2, w / 2);
  const length = perimeterOf(w, h, r);
  const wobble = (t: number): number => amp * Math.sin(lobes * t * Math.PI * 2 + phase);

  let blob: string | null = null;
  if (filled) {
    const points = Array.from({ length: SAMPLES }, (_, i) => {
      const t = i / SAMPLES;
      const p = perimeterAt(t * length, w, h, r);
      // The wobble rides outward from the box: the words never touch the edge.
      const out = wobble(t) + amp;
      return { x: p.x + p.nx * out, y: p.y + p.ny * out };
    });
    blob = smoothPath(points);
  }

  const count = 2 + Math.floor(unit(id, 'drops') * 2);
  const droplets = Array.from({ length: count }, (_, i) => {
    const t = unit(id, `drop:${i}:at`);
    const p = perimeterAt(t * length, w, h, r);
    const radius = 1.5 + unit(id, `drop:${i}:r`) * 1.5;
    const gap = amp * 2 + 2 + radius + unit(id, `drop:${i}:gap`) * 3;
    return { cx: p.x + p.nx * gap, cy: p.y + p.ny * gap, r: radius };
  });

  const rings = Array.from({ length: Math.min(RINGS_MAX, Math.max(0, ripples)) }, (_, i) => ({
    cx: w / 2,
    cy: h / 2 + RING_BELOW_PX,
    rx: w / 2 + RING_SIDE_PX + (i * RING_STEP_PX) / 2,
    ry: h / 2 + RING_BELOW_PX + i * RING_STEP_PX,
  }));

  const shape = { blob, droplets, rings };
  kept.set(key, shape);
  return shape;
}
