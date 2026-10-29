import { isHeic, readableImage } from './heic';
import type { MediaSize } from './ripple-media';

/**
 * A photo, made ready before it leaves the phone (2026-10-28).
 *
 * A modern phone ships 12MP frames of several megabytes, and no screen here
 * draws more than a column's width. So every picked image is decoded and
 * drawn again: the long edge at most 2048px, WebP at 0.82, and a display
 * copy at 1024px for the boards, cards and pages. Drawing it again is also
 * what strips its metadata: a canvas carries pixels only, so EXIF and XMP,
 * the location among them, never leave the phone. The orientation survives
 * because the decoder applies it to the pixels first.
 *
 * An animated GIF is the one exception: a canvas would keep its first frame,
 * so it goes up as it is (GIF carries no EXIF), at most 10MB.
 */
export const FULL_EDGE = 2048;
export const DISPLAY_EDGE = 1024;
export const QUALITY = 0.82;
export const GIF_MAX_BYTES = 10 * 1024 * 1024;

export { isHeic };

export type Encoded = { blob: Blob; size: MediaSize };

/** What goes up: the photo, and its display copy when it is larger than one. */
export type Compressed = { full: Encoded; display: Encoded | null };

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

/** The two sizes a photo is drawn at: the display copy only when it would be smaller. */
export function plannedSizes(source: MediaSize): { full: MediaSize; display: MediaSize | null } {
  const full = fitWithin(source, FULL_EDGE);
  const display = Math.max(full.w, full.h) > DISPLAY_EDGE ? fitWithin(source, DISPLAY_EDGE) : null;
  return { full, display };
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
    return { full: { blob: picked, size }, display: null };
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
    if (!fullContext || (sizes.display && !displayContext)) return { refused: UNREADABLE };

    const transparent =
      mayBeTransparent(file.type) &&
      hasTransparency(displayContext ?? fullContext, sizes.display ?? sizes.full);
    const full = await encode(fullContext.canvas, transparent);
    const display = displayContext ? await encode(displayContext.canvas, transparent) : null;
    if (!full || (displayContext && !display)) return { refused: UNREADABLE };

    // The display copy's path is the photo's with `.d` (displayPathOf), so it
    // must be the same format; a browser that disagreed with itself sends none.
    return {
      full: { blob: full, size: sizes.full },
      display:
        display && sizes.display && display.type === full.type
          ? { blob: display, size: sizes.display }
          : null,
    };
  } finally {
    bitmap.close();
  }
}
