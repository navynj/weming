// What scripts/reencode-media.mjs makes of a stored photo, with sharp: the
// same copies the browser makes on upload (lib/compress-image.ts), so a photo
// from before them is drawn the way a new one is. Pure: bytes in, bytes out.
import sharp from 'sharp';

export const FULL_EDGE = 1600;
export const DISPLAY_EDGE = 1024;
export const THUMB_EDGE = 400;
export const QUALITY = 82;
/** A cutout heavier than this at full size goes up at the display size (as on upload). */
export const CUTOUT_MAX_BYTES = 500 * 1024;
/** A stored photo heavier than this is drawn again. */
export const REENCODE_OVER_BYTES = 300 * 1024;

/** The format a path's extension names, for a copy that keeps it. */
export function formatOfPath(path) {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'png' || ext === 'webp' || ext === 'avif' || ext === 'gif') return ext;
  return null;
}

export const CONTENT_TYPES = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

/** Where a copy lives beside its photo: `.d` or `.t` before the extension (lib/ripple-media.ts). */
export function copyPathOf(path, mark) {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return dot > slash ? `${path.slice(0, dot)}.${mark}${path.slice(dot)}` : `${path}.${mark}`;
}

/** Its size as shown: the EXIF turn applied, as the decoder applies it. */
export async function shownSize(bytes) {
  const meta = await sharp(bytes, { failOn: 'none' }).metadata();
  const turned = (meta.orientation ?? 1) >= 5;
  return turned ? { w: meta.height, h: meta.width } : { w: meta.width, h: meta.height };
}

/** Drawn again inside a long edge, upright, metadata gone (sharp keeps none unless asked). */
async function drawn(bytes, edge, format) {
  let image = sharp(bytes, { failOn: 'none' })
    .rotate()
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true });
  if (format === 'webp') image = image.webp({ quality: QUALITY });
  else if (format === 'jpeg') image = image.jpeg({ quality: QUALITY, mozjpeg: true });
  else if (format === 'png') image = image.png({ compressionLevel: 9, palette: false });
  else if (format === 'avif') image = image.avif({ quality: 60 });
  else throw new Error(`no encoder for ${format}`);
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  return { bytes: new Uint8Array(data), size: { w: info.width, h: info.height } };
}

/**
 * A photo drawn again as WebP (alpha kept): at most 1600px, a 1024px display
 * copy and a 400px thumbnail when it is larger than each. A cutout still
 * over 500 KB at full size goes up at the display size, as on upload.
 */
export async function webpCopies(bytes) {
  const shown = await shownSize(bytes);
  const edge = Math.max(shown.w, shown.h);
  const { isOpaque } = await sharp(bytes, { failOn: 'none' }).stats();
  let full = await drawn(bytes, FULL_EDGE, 'webp');
  let display = edge > DISPLAY_EDGE ? await drawn(bytes, DISPLAY_EDGE, 'webp') : null;
  const thumb = edge > THUMB_EDGE ? await drawn(bytes, THUMB_EDGE, 'webp') : null;
  let capped = false;
  if (!isOpaque && display && full.bytes.length > CUTOUT_MAX_BYTES) {
    full = display;
    display = null;
    capped = true;
  }
  return { source: shown, full, display, thumb, capped, transparent: !isOpaque };
}

/** A thumbnail in the photo's own format, so it can sit at the photo's `.t` path; null when it is already small. */
export async function thumbLike(bytes, format) {
  const shown = await shownSize(bytes);
  if (Math.max(shown.w, shown.h) <= THUMB_EDGE) return { source: shown, thumb: null };
  return { source: shown, thumb: await drawn(bytes, THUMB_EDGE, format) };
}
