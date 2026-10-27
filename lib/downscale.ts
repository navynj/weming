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

/** An iPhone's HEIC: only Safari draws it, so it always leaves as a JPEG. */
export function isHeic(file: Pick<File, 'type' | 'name'>): boolean {
  return /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export async function downscale(file: File): Promise<File> {
  if (!file.type.startsWith('image/') && !isHeic(file)) return file;

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

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  );
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}
