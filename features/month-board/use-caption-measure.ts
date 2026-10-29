'use client';

import { useLayoutEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';

import { measureKey, type BoardPiece, type Measured } from './layout';

/**
 * Measure each title's lines as drawn — unclamped, its full height — and
 * keep any the estimate got wrong, by piece, room and indent; the next
 * layout uses them. Settles in a pass or two: a width, once measured,
 * keeps its count. The board and a shared image (H63) measure alike.
 */
export function useCaptionMeasure(
  canvas: RefObject<HTMLElement | null>,
  pieces: BoardPiece[],
  measured: Measured,
  setMeasured: Dispatch<SetStateAction<Measured>>,
): void {
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const found: Measured = {};
    for (const piece of pieces) {
      const text = el.querySelector<HTMLElement>(
        `[data-board-piece="${piece.id}"] [data-board-text]`,
      );
      if (!text || text.scrollHeight === 0) continue;
      const lines = Math.min(
        piece.type.lines,
        Math.max(1, Math.round(text.scrollHeight / piece.type.line)),
      );
      const key = measureKey(
        piece.id,
        piece.labelBox.w - piece.pad.left - piece.pad.right,
        piece.indent,
        piece.type.size,
      );
      if (lines !== piece.captionLines && measured[key] !== lines) found[key] = lines;
    }
    if (Object.keys(found).length === 0) return;
    // Next frame: the measurement is the browser's, read after it has drawn.
    const frame = requestAnimationFrame(() => setMeasured((current) => ({ ...current, ...found })));
    return () => cancelAnimationFrame(frame);
  }, [canvas, pieces, measured, setMeasured]);
}
