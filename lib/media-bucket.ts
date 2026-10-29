/** Shared with the browser, which uploads into it through URLs the server signs. */
export const MEDIA_BUCKET = 'ripple-media';

/** The type's extension, for a key that is never the file's own name. */
export const MEDIA_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
} as const;

export type MediaType = keyof typeof MEDIA_EXTENSIONS;

/**
 * Where a photo is stored: my folder, a fresh id, the type's extension. Never
 * the file's own name: Storage refuses a key with characters outside its
 * set, so a Korean file name (a KakaoTalk save, a screenshot) failed with
 * "Invalid key" (review: a friend could not attach a photo).
 */
export function mediaKey(userId: string, type: string): string {
  const ext = (MEDIA_EXTENSIONS as Record<string, string>)[type] ?? 'img';
  return `${userId}/${crypto.randomUUID()}.${ext}`;
}
