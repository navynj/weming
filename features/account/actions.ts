'use server';

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { AVATAR_BUCKET, avatarPath } from '@/lib/avatar-bucket';
import type { Database } from '@/lib/database.types';
import { supabaseServiceRoleKey, supabaseUrl } from '@/lib/env';
import { MEDIA_BUCKET } from '@/lib/media-bucket';
import { POOL_PHOTO_BUCKET } from '@/lib/pool-photo-bucket';
import { signedInRecently } from '@/lib/recent-sign-in';
import { reportFailure } from '@/lib/report-failure';
import { createClient } from '@/lib/supabase/server';

/** Each pool I own, and who it goes to; no heir means it is deleted with me. */
export type OwnedPool = {
  poolId: string;
  name: string;
  heirId: string | null;
  heirName: string | null;
};

export type DeletionPreview = {
  /** Signed in within ten minutes: the confirm may go ahead (H53). */
  recent: boolean;
  records: number;
  ripples: number;
  replies: number;
  reactions: number;
  photos: number;
  lanes: number;
  pools: OwnedPool[];
};

const Preview = z.object({
  records: z.number(),
  ripples: z.number(),
  replies: z.number(),
  reactions: z.number(),
  photos: z.number(),
  lanes: z.number(),
  pools: z.array(
    z.object({
      pool_id: z.string(),
      name: z.string(),
      heir_id: z.string().nullable(),
      heir_name: z.string().nullable(),
    }),
  ),
});

/** What the confirm sheet lists, and whether this session signed in recently. */
export async function previewAccountDeletion(): Promise<
  { ok: true; preview: DeletionPreview } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const [{ data: claims }, { data, error }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc('account_deletion_preview'),
  ]);
  if (error) return { ok: false, message: 'That didn’t load. Try again.' };
  const parsed = Preview.safeParse(data);
  if (!parsed.success) return { ok: false, message: 'That didn’t load. Try again.' };
  const p = parsed.data;
  return {
    ok: true,
    preview: {
      recent: signedInRecently(claims?.claims),
      records: p.records,
      ripples: p.ripples,
      replies: p.replies,
      reactions: p.reactions,
      photos: p.photos,
      lanes: p.lanes,
      pools: p.pools.map((pool) => ({
        poolId: pool.pool_id,
        name: pool.name,
        heirId: pool.heir_id,
        heirName: pool.heir_name,
      })),
    },
  };
}

const Deleted = z.object({
  deleted: z.boolean(),
  counts: z.record(z.string(), z.number()),
  pool_photos: z.array(z.string()),
});

function serviceClient() {
  return createServiceClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false },
  });
}

/** Every object under `prefix/` in a bucket, a page at a time. */
async function objectsUnder(
  service: ReturnType<typeof serviceClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await service.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error) throw error;
    paths.push(...(data ?? []).map((object) => `${prefix}/${object.name}`));
    if (!data || data.length < 1000) return paths;
  }
}

async function removeAll(
  service: ReturnType<typeof serviceClient>,
  bucket: string,
  paths: string[],
): Promise<void> {
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await service.storage.from(bucket).remove(paths.slice(i, i + 1000));
    if (error) throw error;
  }
}

/**
 * Deletes my account (H53): the rows in one transaction (delete_my_account,
 * 0065), then my photos, my profile photo and the photos of pools deleted
 * with me, then the auth user, with the service role. Only after a sign-in
 * within ten minutes and the word typed, both checked here, never trusted
 * from the browser. Each step can run again: a retry after a failure
 * finishes what is left.
 */
export async function deleteMyAccount(
  typed: string,
): Promise<{ ok: true } | { ok: false; message: string; signInAgain?: boolean }> {
  if (!z.literal('delete').safeParse(typed.trim().toLowerCase()).success) {
    return { ok: false, message: 'Type “delete” to confirm.' };
  }
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims.sub;
  if (!uid) return { ok: false, message: 'Sign in again to do this.', signInAgain: true };
  if (!signedInRecently(claims.claims)) {
    return {
      ok: false,
      message: 'For your safety, sign in again first. It has been more than 10 minutes.',
      signInAgain: true,
    };
  }

  const { data, error } = await supabase.rpc('delete_my_account');
  const done = Deleted.safeParse(data);
  if (error || !done.success) {
    reportFailure('account', error ?? 'delete_my_account answered nothing');
    return { ok: false, message: 'Your account wasn’t deleted. Nothing changed. Try again.' };
  }

  try {
    const service = serviceClient();
    await removeAll(service, MEDIA_BUCKET, await objectsUnder(service, MEDIA_BUCKET, uid));
    await removeAll(service, AVATAR_BUCKET, [avatarPath(uid)]);
    if (done.data.pool_photos.length > 0) {
      await removeAll(service, POOL_PHOTO_BUCKET, done.data.pool_photos);
    }
    const gone = await service.auth.admin.deleteUser(uid);
    if (gone.error) throw gone.error;
  } catch (failure) {
    reportFailure('account', failure);
    return {
      ok: false,
      message: 'Your records are deleted, but finishing didn’t go through. Try again.',
    };
  }
  await supabase.auth.signOut();
  return { ok: true };
}
