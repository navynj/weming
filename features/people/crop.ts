import { readableImage } from '@/lib/heic';

/** The file every photo becomes: a 512px square (0018). */
export const AVATAR_PX = 512;
const QUALITY = 0.86;

export const UNSUPPORTED_PHOTO =
  "This photo format isn't supported here. Try a screenshot or a JPEG.";

/** What the picker offers. HEIC is listed so an iPhone photo is not filtered out before Safari can try it. */
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/** The image in the crop frame: `zoom` ≥ 1 over cover-fit, `x`/`y` its centre's offset in frame px. */
export type CropView = { zoom: number; x: number; y: number };
export type Size = { width: number; height: number };
export type SourceRect = { sx: number; sy: number; size: number };

/** The scale at which the image just covers the frame. */
function cover(image: Size, frame: number): number {
  return Math.max(frame / image.width, frame / image.height);
}

/** Keeps the frame covered: the image can be moved only as far as its edges. */
export function clampView(view: CropView, image: Size, frame: number): CropView {
  const zoom = Math.min(Math.max(view.zoom, 1), 4);
  const scale = cover(image, frame) * zoom;
  const roomX = (image.width * scale - frame) / 2;
  const roomY = (image.height * scale - frame) / 2;
  return {
    zoom,
    x: Math.min(Math.max(view.x, -roomX), roomX),
    y: Math.min(Math.max(view.y, -roomY), roomY),
  };
}

/** The square of the original image the frame shows, in the image's own pixels. */
export function sourceRect(view: CropView, image: Size, frame: number): SourceRect {
  const { zoom, x, y } = clampView(view, image, frame);
  const scale = cover(image, frame) * zoom;
  const size = frame / scale;
  return {
    sx: image.width / 2 - (frame / 2 + x) / scale,
    sy: image.height / 2 - (frame / 2 + y) / scale,
    size,
  };
}

/**
 * Decodes the picked file the way the crop canvas will draw it. A HEIC the
 * browser cannot read is decoded to a JPEG first (lib/heic.ts); a format that
 * still will not decode rejects with the one message the editor shows,
 * instead of failing silently.
 */
export async function decodePhoto(picked: File): Promise<HTMLImageElement> {
  const file = await readableImage(picked);
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('empty');
    return image;
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(UNSUPPORTED_PHOTO);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/**
 * The crop, drawn into a 512px square and encoded as WebP. A browser that
 * cannot encode WebP (older Safari hands back a PNG instead) gets a JPEG, so
 * the file stays small; the upload names its real type.
 */
export async function encodeAvatar(image: CanvasImageSource, rect: SourceRect): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(UNSUPPORTED_PHOTO);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, rect.sx, rect.sy, rect.size, rect.size, 0, 0, AVATAR_PX, AVATAR_PX);
  const webp = await toBlob(canvas, 'image/webp');
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg');
  if (!jpeg) throw new Error(UNSUPPORTED_PHOTO);
  return jpeg;
}
