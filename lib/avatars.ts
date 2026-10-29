import { createClient as createServiceClient } from '@supabase/supabase-js';

import { AVATAR_BUCKET, avatarPath } from '@/lib/avatar-bucket';
import { POOL_PHOTO_BUCKET } from '@/lib/pool-photo-bucket';
import type { Database } from '@/lib/database.types';
import { supabaseServiceRoleKey, supabaseUrl } from '@/lib/env';
import type { DuringClient } from '@/lib/queries/profile';
import { storage, type Bucket } from '@/lib/storage';

/**
 * A day: a face is drawn on every screen, and a URL that changes each render
 * would defeat the browser's cache. A photo change bumps the version, so a
 * long-lived URL never outlives the photo it shows.
 */
export const AVATAR_TTL_SECONDS = 24 * 60 * 60;
/** Reissued once less than this is left, so no page is handed a URL about to rot. */
const REISSUE_BEFORE_MS = 60 * 60 * 1000;

/**
 * Per (backend, bucket, id, version) on this server: the same version is the
 * same URL across renders, and a URL one backend issued is never handed out
 * once another serves the bytes.
 */
const signed = new Map<string, { url: string; expires: number }>();

export function clearAvatarCache(): void {
  signed.clear();
}

/** Who or what to sign: an id and the version its row names; a null version means none. */
export type AvatarRef = { id: string; version: number | null };

/** The bucket a photo lives in, how its object is named, and who may see it (0018, 0024). */
type PhotoKind = {
  bucket: Bucket;
  path: (id: string) => string;
  /** The ids the viewer may see, answered through the viewer's own session (RLS-side). */
  visible: (supabase: DuringClient, ids: string[]) => Promise<string[]>;
  label: string;
};

/**
 * Signed photo URLs by id, for the ids the viewer may see: the visibility
 * check runs through the viewer's own session, and only then does the
 * service role sign — the pattern ripple media uses. An id without a photo,
 * or one the viewer may not see, comes back null and is drawn as its
 * fallback (initials, a monogram). Never throws: a photo that could not sign
 * is its fallback, not a failed page.
 */
async function signPhotos(
  kind: PhotoKind,
  supabase: DuringClient,
  refs: AvatarRef[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = Object.fromEntries(refs.map((r) => [r.id, null]));
  const withPhoto = refs.filter((r) => r.version !== null);
  if (withPhoto.length === 0) return out;

  try {
    const allowed = new Set(
      await kind.visible(
        supabase,
        withPhoto.map((r) => r.id),
      ),
    );
    const now = Date.now();
    const backend = storage();
    const key = (r: AvatarRef) => `${backend.name}:${kind.bucket}:${r.id}:${r.version}`;
    const missing: AvatarRef[] = [];
    for (const ref of withPhoto) {
      if (!allowed.has(ref.id)) continue;
      const hit = signed.get(key(ref));
      if (hit && hit.expires - now > REISSUE_BEFORE_MS) out[ref.id] = hit.url;
      else missing.push(ref);
    }
    if (missing.length === 0) return out;

    const urls = await backend.signedReadUrls(
      kind.bucket,
      missing.map((r) => kind.path(r.id)),
      AVATAR_TTL_SECONDS,
    );

    for (const ref of missing) {
      const url = urls.get(kind.path(ref.id));
      if (!url) continue;
      signed.set(key(ref), { url, expires: now + AVATAR_TTL_SECONDS * 1000 });
      out[ref.id] = url;
    }
    return out;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[during] ${kind.label} signing failed: ${message}`);
    return out;
  }
}

const AVATARS: PhotoKind = {
  bucket: AVATAR_BUCKET,
  path: avatarPath,
  label: 'avatar',
  visible: async (supabase, ids) => {
    const { data, error } = await supabase.rpc('visible_avatars', { uids: ids });
    if (error) throw error;
    return data;
  },
};

/** Faces (0018): mine, and those of current members of a pool I am in. */
export function signAvatars(
  supabase: DuringClient,
  people: AvatarRef[],
): Promise<Record<string, string | null>> {
  return signPhotos(AVATARS, supabase, people);
}

const POOL_PHOTOS: PhotoKind = {
  bucket: POOL_PHOTO_BUCKET,
  path: (id) => id,
  label: 'pool photo',
  visible: async (supabase, ids) => {
    const { data, error } = await supabase.rpc('visible_pool_photos', { pids: ids });
    if (error) throw error;
    return data;
  },
};

/** Pools' photos (0024): the pools I am in now. A pool I left is its neutral tile. */
export function signPoolPhotos(
  supabase: DuringClient,
  pools: AvatarRef[],
): Promise<Record<string, string | null>> {
  return signPhotos(POOL_PHOTOS, supabase, pools);
}

/**
 * The photo of the pool a valid invite opens (0024): the server asks with
 * the service role (invite_photo checks the token as invite_preview does)
 * and signs a short-lived URL for the join screen. Null when there is none,
 * or the invite is not valid.
 */
export async function signInvitePhoto(token: string): Promise<string | null> {
  try {
    const service = createServiceClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
      auth: { persistSession: false },
    });
    const { data, error } = await service.rpc('invite_photo', { p_token: token });
    if (error) throw error;
    const row = data?.[0];
    if (!row?.photo_path) return null;
    const urls = await storage().signedReadUrls(
      POOL_PHOTO_BUCKET,
      [row.photo_path],
      INVITE_PHOTO_TTL_SECONDS,
    );
    return urls.get(row.photo_path) ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[during] invite photo signing failed: ${message}`);
    return null;
  }
}

/** Ten minutes: long enough to read an invite, short enough that a forwarded URL rots. */
export const INVITE_PHOTO_TTL_SECONDS = 10 * 60;

/** A current member as an invite shows them: their name, and their photo signed briefly. */
export type InviteMember = { name: string; photo: string | null };

/**
 * Who is in the pool a valid invite opens (0067): each current member's name
 * and photo, in the order they joined. The service role asks (invite_members
 * checks the token as invite_preview does) and signs each photo for as long
 * as the pool's own. Empty when the invite is not valid; a photo that could
 * not sign is the member's initials.
 */
export async function signInviteMembers(token: string): Promise<InviteMember[]> {
  try {
    const service = createServiceClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
      auth: { persistSession: false },
    });
    const { data, error } = await service.rpc('invite_members', { p_token: token });
    if (error) throw error;
    const rows = data ?? [];
    const paths = rows.flatMap((r) => (r.avatar_path ? [r.avatar_path] : []));
    const urls = await storage().signedReadUrls(AVATAR_BUCKET, paths, INVITE_PHOTO_TTL_SECONDS);
    return rows.map((r) => ({
      name: r.display_name,
      photo: r.avatar_path ? (urls.get(r.avatar_path) ?? null) : null,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[during] invite members signing failed: ${message}`);
    return [];
  }
}
