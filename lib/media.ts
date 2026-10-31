'use server';

import { getAuthUser } from '@/lib/queries/profile';
import { createClient } from '@/lib/supabase/server';
import { MEDIA_BUCKET } from '@/lib/media-bucket';
import {
  appAssetUrl,
  displayPathOf,
  thumbPathOf,
  isAppAsset,
  isStoragePath,
  isVideoPath,
  mediaMetaOf,
  rippleMedia,
  variantPath,
  videoIdOf,
  type MediaMeta,
  type MediaVariant,
} from '@/lib/ripple-media';
import { thumbnailUrl } from '@/lib/youtube';
import { signMediaObjects } from '@/lib/signed-media-objects';
import { storage } from '@/lib/storage';

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
  const signed = await signMediaObjects([...objectOf.values()]);
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
 * Keyed by the path the record names, so a caller lines each URL up with
 * its path (and the browser's cache can keep it by path). Fallible per item
 * and never throwing: what could not be signed is `null`, and a Ripple the
 * viewer may not see comes back empty.
 */
export async function signRippleMedia(
  rippleId: string,
  variant: MediaVariant,
): Promise<SignedMedia> {
  try {
    const supabase = await createClient();

    // RLS decides. A Ripple the viewer may not see simply is not returned.
    const { data: ripple } = await supabase
      .from('ripples')
      .select('media, media_meta')
      .eq('id', rippleId)
      .maybeSingle();

    if (!ripple || ripple.media.length === 0) return {};

    // An app asset (H58) needs no signing.
    const stored = ripple.media.filter(isStoragePath);
    const signed =
      stored.length > 0
        ? await signVariants(stored, mediaMetaOf(ripple.media_meta), variant)
        : new Map<string, string>();
    return { ...unsignedMedia(ripple.media), ...Object.fromEntries(signed) };
  } catch (error) {
    reportSigningFailure(error);
    return {};
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
  // The display copy's and thumbnail's paths are derived, so they go whether
  // or not the row said it had them; removing a path that is not there is no error.
  await storage().remove(MEDIA_BUCKET, [
    ...stored,
    ...stored.map(displayPathOf),
    ...stored.map(thumbPathOf),
  ]);
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

/** The copies the browser may ask `signBoardPhotos` for: never the full photo. */
const BOARD_VARIANTS: readonly MediaVariant[] = ['thumb', 'display'];

/**
 * Signs the Board view's thumbnails in one round trip, keyed by path: each
 * path with the Ripple it hangs on, on Home and in a pool. Every list that
 * shows photos asks through here, batched (lib/media-url-cache.ts).
 *
 * The same check as `signRippleMedia`, batched: the viewer's own session asks
 * for the Ripples, so RLS answers which may be seen, and a path is signed only
 * when a Ripple that came back carries it. Anything refused, missing or
 * unsigned comes back `null`.
 */
export async function signBoardPhotos(
  photos: { rippleId: string; path: string }[],
  variant: MediaVariant = 'thumb',
): Promise<SignedMedia> {
  const unsigned = unsignedMedia(photos.map((p) => p.path));
  if (photos.length === 0) return unsigned;
  // A server action: what the browser names is checked, never trusted.
  const copy = BOARD_VARIANTS.includes(variant) ? variant : 'thumb';

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

    return { ...unsigned, ...Object.fromEntries(await signVariants(visible, meta, copy)) };
  } catch (error) {
    reportSigningFailure(error);
    return unsigned;
  }
}

/** How long a shared image waits for one video's thumbnail before drawing the plain tile. */
const THUMB_TIMEOUT_MS = 3000;
/** A thumbnail larger than this is not one: the plain tile instead. */
const THUMB_MAX_BYTES = 512 * 1024;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * The media a shared image draws (H63): mine alone. The same check as
 * `signBoardPhotos`, through the viewer's own session, and one more — the
 * ripple an item hangs on must be written by the viewer. Someone else's
 * photo or video is never signed or fetched for an export, whatever the
 * browser asks: the image keeps others' records as shapes, and this is
 * where that cannot be got round. Photos are signed here, not taken from
 * the board's own URLs, so the check above is the one that decides; a video (`yt:<id>`) must be one the
 * ripple's own words link to, its id YouTube's eleven characters, and its
 * thumbnail is fetched here from a URL built here — never one the browser
 * names — and returned as a data URL; `null` draws the plain tile.
 */
export async function signExportMedia(
  items: { rippleId: string; path: string }[],
): Promise<SignedMedia> {
  const unsigned = unsignedMedia(items.map((p) => p.path));
  if (items.length === 0) return unsigned;

  try {
    const supabase = await createClient();
    const user = await getAuthUser(supabase);
    if (!user) return unsigned;
    const { data: rows } = await supabase
      .from('ripples')
      .select('id, media, media_meta, note, video_previews, author_id')
      .in('id', [...new Set(items.map((p) => p.rippleId))])
      .eq('author_id', user.id);
    // Each ripple's own items, read from its row: photos it stores, videos its words link to.
    const itemsOf = new Map(
      (rows ?? []).map((row) => [row.id, new Set(rippleMedia(row).map((m) => m.path))]),
    );
    const carried = (p: { rippleId: string; path: string }): boolean =>
      itemsOf.get(p.rippleId)?.has(p.path) === true;
    const meta: MediaMeta = Object.assign(
      {},
      ...(rows ?? []).map((r) => mediaMetaOf(r.media_meta)),
    );
    const photos = [
      ...new Set(items.flatMap((p) => (isStoragePath(p.path) && carried(p) ? [p.path] : []))),
    ];
    const videos = [
      ...new Set(
        items.flatMap((p) =>
          isVideoPath(p.path) && VIDEO_ID.test(videoIdOf(p.path)) && carried(p) ? [p.path] : [],
        ),
      ),
    ];
    const [signed, thumbs] = await Promise.all([
      photos.length > 0 ? signVariants(photos, meta, 'display') : new Map<string, string>(),
      Promise.all(videos.map(async (path) => [path, await videoThumb(videoIdOf(path))] as const)),
    ]);
    return { ...unsigned, ...Object.fromEntries(signed), ...Object.fromEntries(thumbs) };
  } catch (error) {
    reportSigningFailure(error);
    return unsigned;
  }
}

/** A video's thumbnail as a data URL, from the URL YouTube's id makes; `null` on any failure. */
async function videoThumb(id: string): Promise<string | null> {
  if (!VIDEO_ID.test(id)) return null;
  try {
    const response = await fetch(thumbnailUrl(id), {
      signal: AbortSignal.timeout(THUMB_TIMEOUT_MS),
      redirect: 'error',
      cache: 'no-store',
    });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.startsWith('image/')) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > THUMB_MAX_BYTES) return null;
    return `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}
