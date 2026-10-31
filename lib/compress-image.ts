import { isHeic, readableImage } from './heic';
import type { MediaSize } from './ripple-media';

/**
 * A photo, made ready before it leaves the phone (2026-10-28, sizes
 * 2026-10-30).
 *
 * A modern phone ships 12MP frames of several megabytes, and no screen here
 * draws more than a column's width. So every picked image is decoded and
 * drawn again: the long edge at most 1600px, WebP at 0.82, a display copy at
 * 1024px for the post's page, and a 400px thumbnail for the boards, the
 * grid, the cards and lists. A cutout Safari can only write as PNG (H59)
 * that is still over 500 KB at 1600px goes up at 1024px instead: its display
 * copy becomes the photo. Drawing it again is also
 * what strips its metadata: a canvas carries pixels only, so EXIF and XMP,
 * the location among them, never leave the phone. The orientation survives
 * because the decoder applies it to the pixels first.
 *
 * An animated GIF is the one exception: a canvas would keep its first frame,
 * so it goes up as it is (GIF carries no EXIF), at most 10MB.
 */
export const FULL_EDGE = 1600;
export const DISPLAY_EDGE = 1024;
export const THUMB_EDGE = 400;
/** A PNG cutout heavier than this at full size goes up at the display size. */
export const CUTOUT_MAX_BYTES = 500 * 1024;
export const QUALITY = 0.82;
export const GIF_MAX_BYTES = 10 * 1024 * 1024;

export { isHeic };

export type Encoded = { blob: Blob; size: MediaSize };

/** What goes up: the photo, and its display copy and thumbnail when it is larger than each. */
export type Compressed = { full: Encoded; display: Encoded | null; thumb: Encoded | null };

/** Why a picked file will not go up, in words the composer shows as they are. */
export type Refusal = { refused: string };

export const GIF_TOO_LARGE = 'This GIF is too large. Try one under 10 MB.';
export const UNREADABLE = 'this photo could not be read. Save it as a JPEG and try again.';
export const HEIC_UNREADABLE =
  'this HEIC photo could not be read. Save it as a JPEG and try again.';

/** The size inside a long edge, the ratio kept; never larger than it was. */
export function fitWithin(size: MediaSize, edge: number): MediaSize {
  const scale = Math.min(1, edge / Math.max(size.w, size.h));
  return {
    w: Math.max(1, Math.round(size.w * scale)),
    h: Math.max(1, Math.round(size.h * scale)),
  };
}

/** The sizes a photo is drawn at: each smaller copy only when it would be smaller. */
export function plannedSizes(source: MediaSize): {
  full: MediaSize;
  display: MediaSize | null;
  thumb: MediaSize | null;
} {
  const full = fitWithin(source, FULL_EDGE);
  const edge = Math.max(full.w, full.h);
  const display = edge > DISPLAY_EDGE ? fitWithin(source, DISPLAY_EDGE) : null;
  const thumb = edge > THUMB_EDGE ? fitWithin(source, THUMB_EDGE) : null;
  return { full, display, thumb };
}

/**
 * A PNG cutout still over `CUTOUT_MAX_BYTES` at full size: its display copy,
 * already drawn, goes up as the photo, and there is no display copy beside it.
 */
export function capsCutout(full: Encoded, display: Encoded | null): boolean {
  return full.blob.type === 'image/png' && full.blob.size > CUTOUT_MAX_BYTES && display !== null;
}

/**
 * The format when this browser cannot write WebP (Safari): a cutout keeps its
 * transparency as PNG, anything opaque is a JPEG.
 */
export function fallbackType(transparent: boolean): 'image/png' | 'image/jpeg' {
  return transparent ? 'image/png' : 'image/jpeg';
}

/** A type that can carry transparency, so its pixels are worth checking. */
export function mayBeTransparent(type: string): boolean {
  return /^image\/(png|webp|gif|avif)$/.test(type);
}

/** A file this module sends up untouched: an animated GIF, or anything not an image. */
export function isGif(file: Pick<File, 'type'>): boolean {
  return file.type === 'image/gif';
}

function canvasOf(size: MediaSize): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  return canvas;
}

/** Any pixel not fully opaque. Read once, on the smaller copy, to keep it quick. */
function hasTransparency(context: CanvasRenderingContext2D, size: MediaSize): boolean {
  const { data } = context.getImageData(0, 0, size.w, size.h);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/** WebP; where the browser hands back something else, the fallback for these pixels. */
async function encode(canvas: HTMLCanvasElement, transparent: boolean): Promise<Blob | null> {
  const webp = await toBlob(canvas, 'image/webp');
  if (webp?.type === 'image/webp') return webp;
  return toBlob(canvas, fallbackType(transparent));
}

function draw(bitmap: ImageBitmap, size: MediaSize): CanvasRenderingContext2D | null {
  const context = canvasOf(size).getContext('2d');
  if (!context) return null;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, size.w, size.h);
  return context;
}

async function gifSize(file: Blob): Promise<MediaSize | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/**
 * The picked file, ready to upload, or the reason it cannot be. Never
 * throws for a file the browser cannot read: that comes back as a refusal.
 */
export async function compressImage(picked: File): Promise<Compressed | Refusal> {
  if (isGif(picked)) {
    if (picked.size > GIF_MAX_BYTES) return { refused: GIF_TOO_LARGE };
    const size = await gifSize(picked);
    if (!size) return { refused: UNREADABLE };
    return { full: { blob: picked, size }, display: null, thumb: null };
  }

  // A HEIC this browser cannot draw is decoded first (lib/heic.ts).
  const file = await readableImage(picked);
  const bitmap =
    typeof createImageBitmap === 'function'
      ? await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null)
      : null;
  // Never sent up as it was: its metadata would go with it.
  if (!bitmap) return { refused: isHeic(file) ? HEIC_UNREADABLE : UNREADABLE };

  try {
    const sizes = plannedSizes({ w: bitmap.width, h: bitmap.height });
    const fullContext = draw(bitmap, sizes.full);
    const displayContext = sizes.display ? draw(bitmap, sizes.display) : null;
    const thumbContext = sizes.thumb ? draw(bitmap, sizes.thumb) : null;
    if (!fullContext || (sizes.display && !displayContext) || (sizes.thumb && !thumbContext)) {
      return { refused: UNREADABLE };
    }

    const smallest = thumbContext ?? displayContext ?? fullContext;
    const transparent =
      mayBeTransparent(file.type) &&
      hasTransparency(smallest, sizes.thumb ?? sizes.display ?? sizes.full);
    const fullBlob = await encode(fullContext.canvas, transparent);
    const displayBlob = displayContext ? await encode(displayContext.canvas, transparent) : null;
    const thumbBlob = thumbContext ? await encode(thumbContext.canvas, transparent) : null;
    if (!fullBlob || (displayContext && !displayBlob) || (thumbContext && !thumbBlob)) {
      return { refused: UNREADABLE };
    }

    // Each copy's path is the photo's with `.d` or `.t` (displayPathOf,
    // thumbPathOf), so it must be the same format; a browser that disagreed
    // with itself sends none.
    const sameAs = (blob: Blob | null, size: MediaSize | null): Encoded | null =>
      blob && size && blob.type === fullBlob.type ? { blob, size } : null;
    const full: Encoded = { blob: fullBlob, size: sizes.full };
    const display = sameAs(displayBlob, sizes.display);
    const thumb = sameAs(thumbBlob, sizes.thumb);
    if (display && capsCutout(full, display)) return { full: display, display: null, thumb };
    return { full, display, thumb };
  } finally {
    bitmap.close();
  }
}
