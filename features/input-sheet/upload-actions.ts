'use server';

import { z } from 'zod';

import { MEDIA_BUCKET, MEDIA_EXTENSIONS, mediaKey, type MediaType } from '@/lib/media-bucket';
import { displayPathOf } from '@/lib/ripple-media';
import { storage, type SignedUpload } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';

/** A photo's path never changes, so a browser may keep its bytes for a year. */
const IMMUTABLE_SECONDS = 365 * 24 * 60 * 60;

const Asked = z
  .array(
    z.object({
      type: z.enum(Object.keys(MEDIA_EXTENSIONS) as [MediaType]),
      display: z.boolean(),
    }),
  )
  .min(1)
  .max(8);

export type MediaUpload = { path: string; upload: SignedUpload; display: SignedUpload | null };

/**
 * Upload URLs for photos about to be attached (2026-10-28): the server mints
 * each path in the signed-in person's own folder, so the browser never names
 * where its bytes go, and issues a signed PUT for it (and for its display
 * copy beside it). The bucket's own policy, `<owner>/…`, says the same; this
 * is where it is decided now, whichever backend holds the bytes.
 */
export async function requestMediaUploads(
  asked: z.input<typeof Asked>,
): Promise<{ ok: true; uploads: MediaUpload[] } | { ok: false; message: string }> {
  const parsed = Asked.safeParse(asked);
  if (!parsed.success) return { ok: false, message: 'That photo’s type isn’t one we keep.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'You are signed out. Sign in again to attach a photo.' };

  try {
    const backend = storage();
    const uploads = await Promise.all(
      parsed.data.map(async ({ type, display }) => {
        const path = mediaKey(user.id, type);
        const opts = { contentType: type, cacheControl: IMMUTABLE_SECONDS };
        const [upload, displayUpload] = await Promise.all([
          backend.signedUploadUrl(MEDIA_BUCKET, path, opts),
          display ? backend.signedUploadUrl(MEDIA_BUCKET, displayPathOf(path), opts) : null,
        ]);
        return { path, upload, display: displayUpload };
      }),
    );
    return { ok: true, uploads };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
