import { isHeic, readableImage } from './heic';

/**
 * Shrinks a photo before it leaves the phone.
 *
 * A modern phone ships 12MP frames of several megabytes, and the sheet shows
 * them at a few hundred pixels. Uploading the original spends the author's
 * data and the project's free-tier storage on detail no screen here will ever
 * render.
 */
const MAX_EDGE = 2000;
const QUALITY = 0.82;

export { isHeic };

export async function downscale(picked: File): Promise<File> {
  if (!picked.type.startsWith('image/') && !isHeic(picked)) return picked;
  // A HEIC this browser cannot draw is decoded first (lib/heic.ts); it always
  // leaves as a JPEG, so every browser can draw it back.
  const file = await readableImage(picked);

  const bitmap = await createImageBitmap(file).catch(() => null);
  // Unreadable here: the caller decides (a HEIC outside Safari is refused there).
  if (!bitmap) return file;

  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= MAX_EDGE && !isHeic(file)) {
    bitmap.close();
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // A format that can carry transparency stays one (review, 2026-10-27): a
  // cutout flattened to JPEG would arrive on black. A browser that cannot
  // encode WebP hands back a PNG, which keeps it too.
  const alpha = /^image\/(png|webp|gif)$/.test(file.type);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, alpha ? 'image/webp' : 'image/jpeg', QUALITY),
  );
  if (!blob) return file;

  const ext = blob.type === 'image/webp' ? '.webp' : blob.type === 'image/png' ? '.png' : '.jpg';
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + ext, {
    type: blob.type || 'image/jpeg',
  });
}
