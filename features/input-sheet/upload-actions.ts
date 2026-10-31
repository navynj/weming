'use server';

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '@/lib/database.types';
import { supabaseServiceRoleKey, supabaseUrl } from '@/lib/env';
import { MEDIA_BUCKET, MEDIA_EXTENSIONS, mediaKey, type MediaType } from '@/lib/media-bucket';
import { displayPathOf, thumbPathOf } from '@/lib/ripple-media';
import { storage, type SignedUpload } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/queries/profile';

/** A photo's path never changes, so a browser may keep its bytes for a year. */
const IMMUTABLE_SECONDS = 365 * 24 * 60 * 60;

const Asked = z
  .array(
    z.object({
      type: z.enum(Object.keys(MEDIA_EXTENSIONS) as [MediaType]),
      display: z.boolean(),
      thumb: z.boolean().default(false),
    }),
  )
  .min(1)
  .max(8);

export type MediaUpload = {
  path: string;
  upload: SignedUpload;
  display: SignedUpload | null;
  thumb: SignedUpload | null;
};

/**
 * Upload URLs for photos about to be attached (2026-10-28): the server mints
 * each path in the signed-in person's own folder, so the browser never names
 * where its bytes go, and issues a signed PUT for it (and for its display
 * copy and thumbnail beside it). The bucket's own policy, `<owner>/…`, says the same; this
 * is where it is decided now, whichever backend holds the bytes.
 */
export async function requestMediaUploads(
  asked: z.input<typeof Asked>,
): Promise<{ ok: true; uploads: MediaUpload[] } | { ok: false; message: string }> {
  const parsed = Asked.safeParse(asked);
  if (!parsed.success) return { ok: false, message: 'That photo’s type isn’t one we keep.' };

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false, message: 'You are signed out. Sign in again to attach a photo.' };

  try {
    const backend = storage();
    const uploads = await Promise.all(
      parsed.data.map(async ({ type, display, thumb }) => {
        const path = mediaKey(user.id, type);
        const opts = { contentType: type, cacheControl: IMMUTABLE_SECONDS };
        const [upload, displayUpload, thumbUpload] = await Promise.all([
          backend.signedUploadUrl(MEDIA_BUCKET, path, opts),
          display ? backend.signedUploadUrl(MEDIA_BUCKET, displayPathOf(path), opts) : null,
          thumb ? backend.signedUploadUrl(MEDIA_BUCKET, thumbPathOf(path), opts) : null,
        ]);
        return { path, upload, display: displayUpload, thumb: thumbUpload };
      }),
    );
    return { ok: true, uploads };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

const Discarded = z.array(z.string().min(1).max(200)).max(16);

/**
 * Removes photos uploaded for a draft that will not use them (2026-10-30):
 * one taken off before Drop, a sheet closed without dropping, a drop the
 * server refused. A photo goes up the moment it is picked, so each of
 * those left its objects behind — stored, and named by no row, which is a
 * delete that never happened (CLAUDE.md).
 *
 * Only my own folder, and only what no ripple names: a path a row holds,
 * whoever's row, is a record's photo and stays; the check runs with the
 * service role because a row I cannot read (a handed-over record) still
 * counts. The display copy and thumbnail go with each photo.
 */
export async function discardMediaUploads(paths: string[]): Promise<{ ok: boolean }> {
  const parsed = Discarded.safeParse(paths);
  if (!parsed.success || parsed.data.length === 0) return { ok: parsed.success };
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false };
  const mine = parsed.data.filter(
    (path) => path.startsWith(`${user.id}/`) && !path.slice(user.id.length + 1).includes('/'),
  );
  if (mine.length === 0) return { ok: true };

  try {
    const service = createServiceClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
      auth: { persistSession: false },
    });
    const { data: rows, error } = await service
      .from('ripples')
      .select('media')
      .overlaps('media', mine);
    if (error) throw error;
    const named = new Set((rows ?? []).flatMap((row) => row.media));
    const unused = mine.filter((path) => !named.has(path));
    if (unused.length === 0) return { ok: true };
    await storage().remove(MEDIA_BUCKET, [
      ...unused,
      ...unused.map(displayPathOf),
      ...unused.map(thumbPathOf),
    ]);
    return { ok: true };
  } catch (error) {
    // Nothing waits on this: what slips through is the sweep's (see H69).
    console.error(
      `[during] discarding uploads failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ok: false };
  }
}
