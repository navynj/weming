'use server';

import { getAuthUser } from '@/lib/queries/profile';
import { createClient } from '@/lib/supabase/server';
import { MEDIA_BUCKET } from '@/lib/media-bucket';
import {
  appAssetUrl,
  displayPathOf,
  isAppAsset,
  isStoragePath,
  mediaMetaOf,
  variantPath,
  type MediaMeta,
  type MediaVariant,
} from '@/lib/ripple-media';
import { storage } from '@/lib/storage';

/** Long enough to load a sheet, short enough that a leaked URL rots fast. */
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Signed URLs by path. `null` is a photo that could not be signed — the
 * caller draws a quiet placeholder for it and the page renders regardless.
 * A render must never 500 because one fragment's media could not sign.
 */
export type SignedMedia = Record<string, string | null>;

/**
 * Signs each path's chosen copy, keyed by the path the record names. Storage
 * (lib/storage) signs only after the caller's visibility check has run.
 */
async function signVariants(
  paths: string[],
  meta: MediaMeta,
  variant: MediaVariant,
): Promise<Map<string, string>> {
  const objectOf = new Map(paths.map((path) => [path, variantPath(path, meta, variant)]));
  const signed = await storage().signedReadUrls(
    MEDIA_BUCKET,
    [...new Set(objectOf.values())],
    SIGNED_URL_TTL_SECONDS,
  );
  const out = new Map<string, string>();
  for (const [path, object] of objectOf) {
    const url = signed.get(object);
    if (url) out.set(path, url);
  }
  return out;
}

/** Every path, before signing: `null`, except an app asset (H58), already its URL. */
function unsignedMedia(paths: string[]): SignedMedia {
  return Object.fromEntries(
    paths.map((path) => [path, isAppAsset(path) ? appAssetUrl(path) : null]),
  );
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
export async function signRippleMedia(rippleId: string, variant: MediaVariant): Promise<string[]> {
  try {
    const supabase = await createClient();

    // RLS decides. A Ripple the viewer may not see simply is not returned.
    const { data: ripple } = await supabase
      .from('ripples')
      .select('media, media_meta')
      .eq('id', rippleId)
      .maybeSingle();

    if (!ripple || ripple.media.length === 0) return [];

    // An app asset (H58) needs no signing; the rest keep their order around it.
    const stored = ripple.media.filter(isStoragePath);
    const signed =
      stored.length > 0
        ? await signVariants(stored, mediaMetaOf(ripple.media_meta), variant)
        : new Map<string, string>();
    return ripple.media.flatMap((path) => {
      if (isAppAsset(path)) return [appAssetUrl(path)];
      const url = signed.get(path);
      return url ? [url] : [];
    });
  } catch (error) {
    reportSigningFailure(error);
    return [];
  }
}

/**
 * Removes objects for a Ripple and everything inside it, each photo's
 * display copy with it.
 *
 * Deletes are hard and include storage (CLAUDE.md): a row that is gone while
 * its photograph survives is not a delete, it is a broken reference with a
 * privacy problem attached. This one is allowed to throw: a delete that
 * cannot reach storage should fail loudly, with the variable named.
 */
export async function removeRippleMedia(paths: string[]): Promise<void> {
  // An app asset (H58) is every account's one copy: never the record's to remove.
  const stored = paths.filter(isStoragePath);
  if (stored.length === 0) return;
  // The display copy's path is derived, so it goes whether or not the row
  // said it had one; removing a path that is not there is no error.
  await storage().remove(MEDIA_BUCKET, [...stored, ...stored.map(displayPathOf)]);
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
export async function signOwnMedia(
  paths: string[],
  meta: MediaMeta,
  variant: MediaVariant,
): Promise<SignedMedia> {
  const unsigned = unsignedMedia(paths);
  if (paths.length === 0) return unsigned;

  try {
    // The request's one answer from the auth server (lib/queries/profile.ts).
    const user = await getAuthUser(await createClient());
    if (!user) return unsigned;

    const own = paths.filter((path) => path.startsWith(`${user.id}/`));
    if (own.length === 0) return unsigned;

    // Per item: an entry storage could not sign is one placeholder, not a
    // failed page. The display copy sits in the same folder, so it is mine too.
    return { ...unsigned, ...Object.fromEntries(await signVariants(own, meta, variant)) };
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
  const unsigned = unsignedMedia(photos.map((p) => p.path));
  if (photos.length === 0) return unsigned;

  try {
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from('ripples')
      .select('id, media, media_meta')
      .in('id', [...new Set(photos.map((p) => p.rippleId))]);
    const mediaOf = new Map((rows ?? []).map((row) => [row.id, row.media]));
    // Which copy exists is read from the rows, never from the browser's ask.
    const meta: MediaMeta = Object.assign(
      {},
      ...(rows ?? []).map((r) => mediaMetaOf(r.media_meta)),
    );
    const visible = [
      ...new Set(
        photos.flatMap((p) =>
          isStoragePath(p.path) && mediaOf.get(p.rippleId)?.includes(p.path) ? [p.path] : [],
        ),
      ),
    ];
    if (visible.length === 0) return unsigned;

    // Thumbnails: the display copy where there is one.
    return { ...unsigned, ...Object.fromEntries(await signVariants(visible, meta, 'display')) };
  } catch (error) {
    reportSigningFailure(error);
    return unsigned;
  }
}
