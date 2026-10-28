'use client';

import { useSyncExternalStore } from 'react';

import { aspectKey, type Measured } from './layout';

/**
 * Photos are never cropped (review, 2026-10-27): nothing stores a photo's
 * size, so its ratio is learned from the image once it loads
 * (`notePhotoAspect`) and kept here for the page's life, by path; until
 * then a photo holds the layout's 4:3 placeholder (`photoBox`).
 */
let aspects: Record<string, number> = {};
const listeners = new Set<() => void>();

export function notePhotoAspect(path: string, width: number, height: number): void {
  if (!(width > 0 && height > 0)) return;
  const ratio = width / height;
  if (Math.abs((aspects[path] ?? 0) - ratio) < 0.001) return;
  aspects = { ...aspects, [path]: ratio };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: Record<string, number> = {};

/** Every ratio learned so far; a new object whenever one is added. */
export function usePhotoAspects(): Record<string, number> {
  return useSyncExternalStore(
    subscribe,
    () => aspects,
    () => EMPTY,
  );
}

/** The layout's measurements with the photos' ratios beside the words' lines. */
export function withAspects(measured: Measured, known: Record<string, number>): Measured {
  const out: Measured = { ...measured };
  for (const [path, ratio] of Object.entries(known)) out[aspectKey(path)] = ratio;
  return out;
}

/**
 * For an `<img>`: learns its ratio when it loads, and when it had loaded
 * already — an image the browser had at hand finishes before hydration
 * attaches `onLoad`, and that event is never seen.
 */
export function learnsAspect(path: string): {
  ref: (img: HTMLImageElement | null) => void;
  onLoad: (event: { currentTarget: HTMLImageElement }) => void;
} {
  const note = (img: HTMLImageElement) =>
    notePhotoAspect(path, img.naturalWidth, img.naturalHeight);
  return {
    ref: (img) => {
      if (img?.complete && img.naturalWidth > 0) note(img);
    },
    onLoad: (event) => note(event.currentTarget),
  };
}
