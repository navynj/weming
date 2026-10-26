'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export const ZOOM_MAX = 3;
/** Where a double tap zooms to from the fitted board. */
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 24;
/** A finger that travels this far is panning, and its click is swallowed. */
const PAN_SLOP_PX = 8;

const clamp = (z: number): number => Math.min(ZOOM_MAX, Math.max(1, z));

/** The content point to keep under a screen point once the new size is laid out. */
type Anchor = { cx: number; cy: number; sx: number; sy: number };

/**
 * Pinch and double-tap zoom over the fitted board, 1x to 3x (Board view):
 * the scroller pans natively in both axes; a pinch scales about its centre,
 * and the scroll is moved after the resize so the point under the fingers
 * stays under them. Trackpad pinches arrive as ctrl+wheel and do the same.
 * The page itself never zooms: the board is the one thing that scales.
 */
export function useBoardZoom(): {
  /** The board's scroller: the hook's own, so it alone moves its scroll. */
  scroller: RefObject<HTMLDivElement | null>;
  zoom: number;
  /** For the pieces' `onClickCapture`: true while a gesture that moved has just ended. */
  moved: RefObject<boolean>;
  toggleAt: (clientX: number, clientY: number) => void;
} {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<{ zoom: number; anchor: Anchor | null }>({
    zoom: 1,
    anchor: null,
  });
  const zoomRef = useRef(1);
  const moved = useRef(false);

  const zoomTo = useCallback((next: number, clientX: number, clientY: number): void => {
    const el = scroller.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const z = zoomRef.current;
    zoomRef.current = clamp(next);
    setView({
      zoom: zoomRef.current,
      anchor: { cx: (el.scrollLeft + sx) / z, cy: (el.scrollTop + sy) / z, sx, sy },
    });
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    const at = view.anchor;
    if (!el || !at) return;
    el.scrollTo({ left: at.cx * view.zoom - at.sx, top: at.cy * view.zoom - at.sy });
  }, [view]);

  const toggleAt = useCallback(
    (clientX: number, clientY: number): void =>
      zoomTo(zoomRef.current > 1 ? 1 : DOUBLE_TAP_ZOOM, clientX, clientY),
    [zoomTo],
  );

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let pinch: { dist: number; zoom: number } | null = null;
    let start: { x: number; y: number } | null = null;
    let lastTap: { at: number; x: number; y: number } | null = null;

    const distance = (t: TouchList): number =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const centre = (t: TouchList): [number, number] => [
      (t[0].clientX + t[1].clientX) / 2,
      (t[0].clientY + t[1].clientY) / 2,
    ];

    const onStart = (event: TouchEvent): void => {
      if (event.touches.length === 2) {
        pinch = { dist: distance(event.touches), zoom: zoomRef.current };
        moved.current = true;
      } else if (event.touches.length === 1) {
        start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        moved.current = false;
      }
    };
    const onMove = (event: TouchEvent): void => {
      if (pinch && event.touches.length === 2) {
        event.preventDefault();
        const [x, y] = centre(event.touches);
        zoomTo((pinch.zoom * distance(event.touches)) / pinch.dist, x, y);
        return;
      }
      const t = event.touches[0];
      if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > PAN_SLOP_PX) {
        moved.current = true;
      }
    };
    const onEnd = (event: TouchEvent): void => {
      if (event.touches.length < 2) pinch = null;
      if (event.touches.length > 0 || moved.current) {
        lastTap = null;
        return;
      }
      const t = event.changedTouches[0];
      if (!t) return;
      const now = event.timeStamp;
      if (
        lastTap &&
        now - lastTap.at < DOUBLE_TAP_MS &&
        Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < DOUBLE_TAP_SLOP_PX
      ) {
        // The second tap zooms; it opens nothing.
        event.preventDefault();
        lastTap = null;
        toggleAt(t.clientX, t.clientY);
        return;
      }
      lastTap = { at: now, x: t.clientX, y: t.clientY };
    };
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      zoomTo(zoomRef.current * Math.exp(-event.deltaY / 100), event.clientX, event.clientY);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, [zoomTo, toggleAt]);

  return { scroller, zoom: view.zoom, moved, toggleAt };
}
