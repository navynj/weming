'use server';

import { createClient as createServiceClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { supabaseServiceRoleKey, supabaseUrl } from '@/lib/env';
import { getAuthUser } from '@/lib/queries/profile';
import { createClient } from '@/lib/supabase/server';
import { MEDIA_BUCKET } from '@/lib/media-bucket';

/** Long enough to load a sheet, short enough that a leaked URL rots fast. */
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Signed URLs by path. `null` is a photo that could not be signed — the
 * caller draws a quiet placeholder for it and the page renders regardless.
 * A render must never 500 because one fragment's media could not sign.
 */
export type SignedMedia = Record<string, string | null>;

/**
 * The service role signs and removes objects. Made here, inside the call
 * that needs it, so a missing key fails as `Missing SUPABASE_SERVICE_ROLE_KEY`
 * at that call and nowhere earlier.
 */
function serviceClient() {
  return createServiceClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false },
  });
}

function reportSigningFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[during] media signing failed: ${message}`);
}

/**
 * Signs the media on a Ripple, after checking that the viewer may see the
 * Ripple at all.
 *
 * The check is the point. A path-prefix read policy — `<owner>/…` — can only
 * answer "is this mine", which S0 rejected: a pool member must be able to see
 * media on a Ripple they are allowed to see, and must still be refused a
 * locked one (Link retired in 0023; pools are the one way to share). So the
 * visibility check runs through the viewer's own session (RLS answers it),
 * and only then does the service role sign. The same code path serves the
 * owner and a pool member without changing.
 *
 * Fallible per item and never throwing: what could not be signed is left out.
 */
export async function signRippleMedia(rippleId: string): Promise<string[]> {
  try {
    const supabase = await createClient();

    // RLS decides. A Ripple the viewer may not see simply is not returned.
    const { data: ripple } = await supabase
      .from('ripples')
      .select('media')
      .eq('id', rippleId)
      .maybeSingle();

    if (!ripple || ripple.media.length === 0) return [];

    const { data, error } = await serviceClient()
      .storage.from(MEDIA_BUCKET)
      .createSignedUrls(ripple.media, SIGNED_URL_TTL_SECONDS);

    if (error) {
      reportSigningFailure(error);
      return [];
    }
    return data.flatMap((entry) => (entry.signedUrl ? [entry.signedUrl] : []));
  } catch (error) {
    reportSigningFailure(error);
    return [];
  }
}

/**
 * Removes objects for a Ripple and everything inside it.
 *
 * Deletes are hard and include storage (CLAUDE.md): a row that is gone while
 * its photograph survives is not a delete, it is a broken reference with a
 * privacy problem attached. This one is allowed to throw: a delete that
 * cannot reach storage should fail loudly, with the variable named.
 */
export async function removeRippleMedia(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await serviceClient().storage.from(MEDIA_BUCKET).remove(paths);
}

/**
 * Signs my own photos for the flow's thumbnails, by path, in one round trip.
 *
 * Owner-only by construction: only paths under the caller's own folder are
 * signed, so this cannot be used to reach a record the visibility check on
 * `signRippleMedia` would refuse. P2's friend-visible rows go through that
 * one, per Ripple, where the check lives.
 *
 * Every requested path comes back: signed, or `null` when it could not be —
 * a path that is not mine, an entry storage refused, a batch that failed, a
 * client that could not be made. The failure is logged once, named, and the
 * page draws placeholders; it does not fall over.
 */
export async function signOwnMedia(paths: string[]): Promise<SignedMedia> {
  const unsigned: SignedMedia = Object.fromEntries(paths.map((path) => [path, null]));
  if (paths.length === 0) return unsigned;

  try {
    // The request's one answer from the auth server (lib/queries/profile.ts).
    const user = await getAuthUser(await createClient());
    if (!user) return unsigned;

    const own = paths.filter((path) => path.startsWith(`${user.id}/`));
    if (own.length === 0) return unsigned;

    const { data, error } = await serviceClient()
      .storage.from(MEDIA_BUCKET)
      .createSignedUrls(own, SIGNED_URL_TTL_SECONDS);
    if (error) {
      reportSigningFailure(error);
      return unsigned;
    }

    // Per item: an entry storage could not sign is one placeholder, not a
    // failed page.
    return {
      ...unsigned,
      ...Object.fromEntries(
        data.flatMap((entry) =>
          entry.signedUrl && entry.path ? [[entry.path, entry.signedUrl]] : [],
        ),
      ),
    };
  } catch (error) {
    reportSigningFailure(error);
    return unsigned;
  }
}

/**
 * Signs the Board view's thumbnails in one round trip, keyed by path: each
 * path with the Ripple it hangs on, on Home and in a pool.
 *
 * The same check as `signRippleMedia`, batched: the viewer's own session asks
 * for the Ripples, so RLS answers which may be seen, and a path is signed only
 * when a Ripple that came back carries it. Anything refused, missing or
 * unsigned comes back `null`.
 */
export async function signBoardPhotos(
  photos: { rippleId: string; path: string }[],
): Promise<SignedMedia> {
  const unsigned: SignedMedia = Object.fromEntries(photos.map((p) => [p.path, null]));
  if (photos.length === 0) return unsigned;

  try {
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from('ripples')
      .select('id, media')
      .in('id', [...new Set(photos.map((p) => p.rippleId))]);
    const mediaOf = new Map((rows ?? []).map((row) => [row.id, row.media]));
    const visible = [
      ...new Set(
        photos.flatMap((p) => (mediaOf.get(p.rippleId)?.includes(p.path) ? [p.path] : [])),
      ),
    ];
    if (visible.length === 0) return unsigned;

    const { data, error } = await serviceClient()
      .storage.from(MEDIA_BUCKET)
      .createSignedUrls(visible, SIGNED_URL_TTL_SECONDS);
    if (error) {
      reportSigningFailure(error);
      return unsigned;
    }
    return {
      ...unsigned,
      ...Object.fromEntries(
        data.flatMap((entry) =>
          entry.signedUrl && entry.path ? [[entry.path, entry.signedUrl]] : [],
        ),
      ),
    };
  } catch (error) {
    reportSigningFailure(error);
    return unsigned;
  }
}
