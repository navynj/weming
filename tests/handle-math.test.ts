import { describe, expect, it } from 'vitest';

import { clearLayout, mergeLayout } from '@/features/month-board/board-layout';
import {
  alongTilt,
  cornerPulled,
  moveHolding,
  pointOfBox,
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

  it('sizes from a corner by the travel since the finger went down, on the turned diagonal', () => {
    // Along the diagonal, 20px each way: the corner 20px further out on both sides.
    expect(cornerPulled(100, 20, 20, 0)).toBeCloseTo(120);
    expect(cornerPulled(100, -20, -20, 0)).toBeCloseTo(80);
    // Straight across, half of it lies along the diagonal.
    expect(cornerPulled(100, 20, 0, 0)).toBeCloseTo(110);
    // Turned 90°, the diagonal turns with it.
    expect(cornerPulled(100, -20, 20, 90)).toBeCloseTo(120);
    // Over the board's CSS scale: drawn at twice its size, a 40px pull is 20.
    expect(cornerPulled(100, 40, 40, 0, 2)).toBeCloseTo(120);
  });

  it('holds a point of a part still as its box changes, turned about its centre', () => {
    const box = { x: 10, y: 20, w: 100, h: 40 };
    // Unturned, the top-left is the box's own corner plus its move.
    expect(pointOfBox(box, { x: 5, y: 6 }, 0, { x: 0, y: 0 })).toEqual({ x: 15, y: 26 });
    for (const tilt of [0, 20, -35]) {
      const at = pointOfBox(box, { x: 5, y: 6 }, tilt, { x: 0, y: 0 });
      // Wider, laid out further right and lower by the engine: the move puts the corner back.
      const grown = { x: 30, y: 25, w: 160, h: 52 };
      const move = moveHolding(at, grown, tilt, { x: 0, y: 0 });
      const again = pointOfBox(grown, move, tilt, { x: 0, y: 0 });
      expect(again.x).toBeCloseTo(at.x);
      expect(again.y).toBeCloseTo(at.y);
    }
    // A pinch's midpoint, read as a share of the part once, held the same way.
    const share = shareOf({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 25, y: 75 });
    expect(share.x).toBeCloseTo(0.25);
    expect(share.y).toBeCloseTo(0.75);
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
