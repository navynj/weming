import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * A pool's photo (0024), against the real schema and storage with throwaway
 * users: Ana opens a pool, Ben joins, Cal stays outside. Only the creator
 * writes, sets or removes it; members get signed URLs, outsiders and leavers
 * do not; a valid invite shows it on the join screen, a revoked one does not.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */
const as = vi.hoisted(() => ({ user: '' }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/supabase/server', async () => {
  const { asUser: client } = await import('./as-user');
  return {
    createClient: async () => {
      const supabase = client(as.user);
      supabase.auth.getClaims = (async () => ({
        data: { claims: { sub: as.user } },
        error: null,
      })) as unknown as typeof supabase.auth.getClaims;
      return supabase;
    },
  };
});

import { setPoolPhoto } from '@/features/pool/actions';
import { clearAvatarCache, signInvitePhoto, signPoolPhotos } from '@/lib/avatars';
import { POOL_PHOTO_BUCKET } from '@/lib/pool-photo-bucket';

let ana: string;
let ben: string;
let cal: string;
let pool: string;
let token: string;
const PHOTO = new Blob([new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])], {
  type: 'image/webp',
});

async function person(name: string): Promise<string> {
  const { data, error } = await asAdmin().auth.admin.createUser({
    email: `pool-photo-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  await asAdmin()
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, timezone: 'America/Vancouver' });
  return data.user.id;
}
const version = async () =>
  (await asAdmin().from('pools').select('photo_version').eq('id', pool).single()).data!
    .photo_version;

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cal = await person('Cal');
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Faces',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🏕', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  pool = made.data!;
  token = (await asUser(ana).rpc('create_invite', { p_pool: pool })).data![0].token;
  const joined = await asUser(ben).rpc('join_pool', {
    p_token: token,
    p_links: [],
    p_include_history: false,
  });
  if (joined.error) throw joined.error;
});

afterAll(async () => {
  const admin = asAdmin();
  if (pool) {
    await admin.storage.from(POOL_PHOTO_BUCKET).remove([pool]);
    await admin.from('pools').delete().eq('id', pool);
  }
  for (const id of [ana, ben, cal].filter(Boolean)) await admin.auth.admin.deleteUser(id);
});

describe('setting a pool photo (0024)', () => {
  it('is any current member’s to upload (0059); refused to someone outside, in storage and in the row', async () => {
    const mine = await asUser(ben).storage.from(POOL_PHOTO_BUCKET).upload(pool, PHOTO, {
      contentType: 'image/webp',
      upsert: true,
    });
    expect(mine.error).toBeNull();
    const theirs = await asUser(cal).storage.from(POOL_PHOTO_BUCKET).upload(pool, PHOTO, {
      contentType: 'image/webp',
      upsert: true,
    });
    expect(theirs.error).not.toBeNull();
    as.user = cal;
    expect((await setPoolPhoto(pool, true)).ok).toBe(false);
  });

  it('is the creator’s: upload, then the row names version 1', async () => {
    const up = await asUser(ana).storage.from(POOL_PHOTO_BUCKET).upload(pool, PHOTO, {
      contentType: 'image/webp',
      upsert: true,
    });
    expect(up.error).toBeNull();
    as.user = ana;
    expect(await setPoolPhoto(pool, true)).toEqual({ ok: true });
    expect(await version()).toBe(1);
  });
});

describe('who sees it', () => {
  it('a member gets a signed URL that serves the photo; an outsider gets none', async () => {
    clearAvatarCache();
    const forBen = await signPoolPhotos(asUser(ben), [{ id: pool, version: 1 }]);
    expect(forBen[pool]).toMatch(/^http/);
    expect((await fetch(forBen[pool]!)).status).toBe(200);
    clearAvatarCache();
    expect((await signPoolPhotos(asUser(cal), [{ id: pool, version: 1 }]))[pool]).toBeNull();
  });

  it('the join screen shows it for a valid invite, not for a revoked one', async () => {
    const url = await signInvitePhoto(token);
    expect(url).toMatch(/^http/);
    expect((await fetch(url!)).status).toBe(200);
    expect(await signInvitePhoto('not-a-token')).toBeNull();
    const other = (await asUser(ana).rpc('create_invite', { p_pool: pool })).data![0].token;
    expect(await signInvitePhoto(other)).toMatch(/^http/);
    const invite = (await asUser(ana).from('pool_invites').select('id').eq('token', other).single())
      .data!.id;
    expect((await asUser(ana).rpc('revoke_invite', { p_invite: invite })).error).toBeNull();
    expect(await signInvitePhoto(other)).toBeNull();
  });

  it('a member who left sees the neutral tile, no photo', async () => {
    expect((await asUser(ben).rpc('leave_pool', { p_pool: pool, p_keep: true })).error).toBeNull();
    clearAvatarCache();
    expect((await signPoolPhotos(asUser(ben), [{ id: pool, version: 1 }]))[pool]).toBeNull();
  });
});

describe('removing it', () => {
  it('deletes the bytes and returns the pool to its letters', async () => {
    const removed = await asUser(ana).storage.from(POOL_PHOTO_BUCKET).remove([pool]);
    expect(removed.error).toBeNull();
    as.user = ana;
    expect(await setPoolPhoto(pool, false)).toEqual({ ok: true });
    expect(await version()).toBeNull();
    const { data } = await asAdmin().storage.from(POOL_PHOTO_BUCKET).list('', { search: pool });
    expect(data ?? []).toHaveLength(0);
  });
});
