import { describe, expect, it } from 'vitest';

import { clearLayout, mergeLayout } from '@/features/month-board/board-layout';
import {
  alongTilt,
  cornerSized,
  heldAt,
  pointOn,
  shareOf,
  widened,
  moved,
  nudged,
  partPatch,
  pathsOf,
  resized,
  restoring,
  spanned,
  spannedFromLeft,
  stepFont,
  turned,
} from '@/features/month-board/handle-math';

describe('handles, in layout units (review, direct manipulation)', () => {
  it('moves by the pixels travelled: X a share of the lane, Y in line heights, from where it was', () => {
    expect(moved({}, 70, 26, 140, 13)).toEqual({ x: 0.5, y: 2 });
    expect(moved({ x: 0.25, y: -1 }, -35, 13, 140, 13)).toEqual({ x: 0, y: 0 });
  });

  it('clamps a move to the database’s ranges', () => {
    expect(moved({ x: 2.9 }, 1000, 0, 100, 13).x).toBe(3);
    expect(moved({ y: -19 }, 0, -1000, 100, 13).y).toBe(-20);
  });

  it('turns by how far the angle moved, snapping to straight within 3 degrees, never past 45', () => {
    expect(turned(undefined, -90, -60)).toBe(30);
    expect(turned(10, 0, -8)).toBe(0);
    expect(turned(0, 0, 2.6)).toBe(0);
    expect(turned(0, 0, 4)).toBe(4);
    expect(turned(0, -90, 0)).toBe(45);
    expect(turned(0, 0, -120)).toBe(-45);
    // Across the ±180° seam the short way round.
    expect(turned(0, 170, -170)).toBe(20);
  });

  it('sizes a sticker in the board’s line heights and a photo as a share of the lane, within range', () => {
    expect(resized('icon', 26, 2, 13)).toBe(4);
    expect(resized('icon', 26, 10, 13)).toBe(8);
    expect(resized('photo', 70, 1.5, 140)).toBe(0.75);
    expect(resized('photo', 70, 0.1, 140)).toBe(0.2);
  });

  it('lengthens the wave from its right end, or its left end with its start following', () => {
    expect(spanned(1, 50, 100)).toBe(1.5);
    expect(spanned(1, -500, 100)).toBe(0.2);
    // The left end pulled 50px left: half a label longer, its start half a lane (100px) left.
    expect(spannedFromLeft({ span: 1 }, -50, 100, 100, 13)).toEqual({ x: -0.5, y: 0, span: 1.5 });
    // Along a wave turned 90°, a drag down is a drag along it.
    expect(alongTilt(0, 10, 90)).toBeCloseTo(10);
  });

  it('sizes from a corner one to one, the opposite corner held: a 20px pull on 100px is 120px', () => {
    const tl = { x: 0, y: 0 };
    const br = { x: 100, y: 100 };
    expect(cornerSized(100, tl, br, { x: 20, y: 20 })).toBeCloseTo(120);
    expect(cornerSized(100, tl, br, { x: -20, y: -20 })).toBeCloseTo(80);
    // Read along the diagonal: a pull straight across counts half.
    expect(cornerSized(100, tl, br, { x: 20, y: 0 })).toBeCloseTo(110);
    // Turned 90°, the diagonal turns with it.
    expect(cornerSized(100, tl, { x: -100, y: 100 }, { x: -20, y: 20 })).toBeCloseTo(120);
  });

  it('finds a point of a turned square box and back, and takes its drift off the offset', () => {
    const tl = { x: 10, y: 10 };
    const br = { x: 10, y: 10 + 100 * Math.SQRT2 };
    const mid = pointOn(tl, br, { x: 0.5, y: 0.5 });
    expect(mid.x).toBeCloseTo(10);
    expect(mid.y).toBeCloseTo(10 + 50 * Math.SQRT2);
    const share = shareOf(tl, br, { x: 30, y: 60 });
    const back = pointOn(tl, br, share);
    expect(back.x).toBeCloseTo(30);
    expect(back.y).toBeCloseTo(60);
    // Drifted 14px right and 13px down: 0.1 lane and a line back.
    expect(heldAt({ x: 0.5, y: 2 }, { x: 14, y: 13 }, 140, 13)).toEqual({ x: 0.4, y: 1 });
  });

  it('widens a label by its right edge, in column widths, 0.3 to 4', () => {
    expect(widened(140, 70, 140)).toBe(1.5);
    expect(widened(140, 1000, 140)).toBe(4);
    expect(widened(140, -1000, 140)).toBe(0.3);
  });

  it('nudges by a slider’s step on the arrows, ten with Shift, and turns a degree on [ and ]', () => {
    expect(nudged({}, 'ArrowRight', false)).toEqual({ x: 0.01 });
    expect(nudged({ x: 0.5 }, 'ArrowLeft', true)).toEqual({ x: 0.4 });
    expect(nudged({}, 'ArrowDown', false)).toEqual({ y: 0.1 });
    expect(nudged({ y: 1 }, 'ArrowUp', true)).toEqual({ y: 0 });
    // Never snapped: a degree at a time leaves straight.
    expect(nudged({}, ']', false)).toEqual({ tilt: 1 });
    expect(nudged({ tilt: 45 }, ']', false)).toEqual({ tilt: 45 });
    expect(nudged({}, 'a', false)).toBeNull();
  });

  it('steps text size by a point within 10 to 18', () => {
    expect(stepFont(14, 1)).toBe(15);
    expect(stepFont(10, -1)).toBe(10);
    expect(stepFont(18, 1)).toBe(18);
  });

  it('writes a part’s values to its own place in the layout', () => {
    expect(partPatch({ kind: 'photo', path: 'a/b.jpg' }, { x: 0.1, size: 0.5 })).toEqual({
      photos: { 'a/b.jpg': { x: 0.1, size: 0.5 } },
    });
    expect(partPatch({ kind: 'wave' }, { span: 2, size: 9 })).toEqual({ wave: { span: 2 } });
  });
});

describe('undo (review): the write that puts a change back', () => {
  const apply = (layout: object, w: { patch: object; clear: string[] }) =>
    clearLayout(mergeLayout(layout, w.patch), w.clear);

  it('sets each path back to what it held, and clears each that was the recipe’s', () => {
    const before = { label: { x: 0.2 } };
    const patch = { label: { x: 0.5, y: 2 } };
    const after = apply(before, { patch, clear: [] });
    const back = restoring(before, pathsOf(patch, []));
    expect(back).toEqual({ patch: { label: { x: 0.2 } }, clear: ['label.y'] });
    expect(apply(after, back)).toEqual(before);
  });

  it('brings back what Reset all cleared, a photo’s fields by its path (dots and all)', () => {
    const before = {
      icon: { size: 3 },
      photos: { 'u/a.b.jpg': { x: 0.1, hidden: true } },
      wave: { on: true, span: 2 },
    };
    const clear = ['icon', 'label', 'photos', 'wave'];
    const after = apply(before, { patch: {}, clear });
    expect(after).toEqual({});
    expect(apply(after, restoring(before, pathsOf({}, clear)))).toEqual(before);
    const photo = { photos: { 'u/a.b.jpg': { tilt: 9 } } };
    const moved = apply(before, { patch: photo, clear: [] });
    expect(apply(moved, restoring(before, pathsOf(photo, [])))).toEqual(before);
  });
});
