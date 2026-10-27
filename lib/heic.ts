/**
 * An iPhone's HEIC, made drawable wherever it is picked (review: every
 * upload takes HEIC). Safari draws HEIC itself; elsewhere (Chrome, Android)
 * it is decoded to a JPEG here, by heic2any (MIT), loaded only then — no
 * other upload or page pays for it.
 */

/** A HEIC by its type or its name: some pickers hand one over with no type. */
export function isHeic(file: Pick<File, 'type' | 'name'>): boolean {
  return /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/** Whether this browser can draw the file as it is. */
async function drawable(file: Blob): Promise<boolean> {
  if (typeof createImageBitmap !== 'function') return false;
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * The file as the browser can draw it: a HEIC it cannot read becomes a JPEG;
 * anything else, and a HEIC it can, comes back as it was. A HEIC that will
 * not decode even so comes back as it was too, for the caller to refuse with
 * a reason.
 */
export async function readableImage(file: File): Promise<File> {
  if (!isHeic(file) || (await drawable(file))) return file;
  try {
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const blob = Array.isArray(out) ? out[0] : out;
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
