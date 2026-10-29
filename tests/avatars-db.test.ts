import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * A profile photo (0018), against the real schema and storage with
 * throwaway users: Ana opens a pool, Ben joins it, Cal stays outside. Ben's
 * photo is signed for Ana and for himself, never for Cal, and not for Ana
 * once Ben has left. Only Ben writes his file; removing it removes the bytes.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */
const as = vi.hoisted(() => ({ user: '' }));
// An action called outside Next: what it asks of the router is a no-op here.
vi.mock('next/cache', () => ({ refresh: () => {}, revalidatePath: () => {} }));
vi.mock('@/lib/supabase/server', async () => {
  const { asUser: client } = await import('./as-user');
  return {
    createClient: async () => {
      const supabase = client(as.user);
      // A minted token has no GoTrue session behind it; the action only needs the id.
      supabase.auth.getUser = (async () => ({
        data: { user: { id: as.user } },
        error: null,
      })) as unknown as typeof supabase.auth.getUser;
      return supabase;
    },
  };
});

import { saveProfile } from '@/features/people/actions';
import { AVATAR_BUCKET } from '@/lib/avatar-bucket';
import { clearAvatarCache, signAvatars } from '@/lib/avatars';

let ana: string;
let ben: string;
let cal: string;
let pool: string;
const PHOTO = new Blob([new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])], {
  type: 'image/webp',
});

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `avatar-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  await admin
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, timezone: 'America/Vancouver' });
  return data.user.id;
}

async function versionOf(id: string): Promise<number | null> {
  return (await asAdmin().from('profiles').select('avatar_version').eq('id', id).single()).data!
    .avatar_version;
}

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
  const token = (await asUser(ana).rpc('create_invite', { p_pool: pool })).data![0].token;
  const joined = await asUser(ben).rpc('join_pool', {
    p_token: token,
    p_links: [],
    p_include_history: false,
  });
  if (joined.error) throw joined.error;

  // Ben's photo: the browser's upload, then the save that bumps the version.
  const up = await asUser(ben).storage.from(AVATAR_BUCKET).upload(ben, PHOTO, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (up.error) throw up.error;
  as.user = ben;
  const saved = await saveProfile({ name: '  Ben Park  ', photo: 'uploaded' });
  expect(saved).toEqual({ ok: true });
});

afterAll(async () => {
  const admin = asAdmin();
  if (ben) await admin.storage.from(AVATAR_BUCKET).remove([ben]);
  if (pool) await admin.from('pools').delete().eq('id', pool);
  for (const id of [ana, ben, cal].filter(Boolean)) await admin.auth.admin.deleteUser(id);
});

describe('saving a profile', () => {
  it('trims the name and bumps the photo version', async () => {
    const row = (await asAdmin().from('profiles').select('*').eq('id', ben).single()).data!;
    expect(row.display_name).toBe('Ben Park');
    expect(row.avatar_path).toBe(ben);
    expect(row.avatar_version).toBe(1);
  });

  it('refuses an empty name and one past 40 characters', async () => {
    as.user = ben;
    expect((await saveProfile({ name: '   ', photo: 'keep' })).ok).toBe(false);
    expect((await saveProfile({ name: 'x'.repeat(41), photo: 'keep' })).ok).toBe(false);
  });
});

describe('who gets a signed URL', () => {
  it('a co-member does, and it serves the photo', async () => {
    clearAvatarCache();
    const urls = await signAvatars(asUser(ana), [{ id: ben, version: await versionOf(ben) }]);
    expect(urls[ben]).toMatch(/^http/);
    const served = await fetch(urls[ben]!);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/webp');
  });

  it('I do, for my own', async () => {
    const urls = await signAvatars(asUser(ben), [{ id: ben, version: 1 }]);
    expect(urls[ben]).toMatch(/^http/);
  });

  it('a non-member does not', async () => {
    clearAvatarCache();
    const urls = await signAvatars(asUser(cal), [{ id: ben, version: 1 }]);
    expect(urls[ben]).toBeNull();
  });

  it('a non-member cannot read the file from storage directly', async () => {
    const { data } = await asUser(cal).storage.from(AVATAR_BUCKET).download(ben);
    expect(data).toBeNull();
    const signed = await asUser(cal).storage.from(AVATAR_BUCKET).createSignedUrl(ben, 60);
    expect(signed.data).toBeNull();
  });

  it('nobody but me writes my file', async () => {
    const { error } = await asUser(cal).storage.from(AVATAR_BUCKET).upload(ben, PHOTO, {
      contentType: 'image/webp',
      upsert: true,
    });
    expect(error).not.toBeNull();
    const { error: other } = await asUser(cal)
      .from('profiles')
      .update({ avatar_path: ben, avatar_version: 9 })
      .eq('id', cal);
    expect(other?.code).toBe('23514');
  });
});

describe('the cache', () => {
  it('gives the same URL for the same version, and a new one for a new version', async () => {
    clearAvatarCache();
    const first = (await signAvatars(asUser(ana), [{ id: ben, version: 1 }]))[ben];
    const again = (await signAvatars(asUser(ana), [{ id: ben, version: 1 }]))[ben];
    expect(again).toBe(first);

    as.user = ben;
    await asUser(ben).storage.from(AVATAR_BUCKET).upload(ben, PHOTO, {
      contentType: 'image/webp',
      upsert: true,
    });
    await saveProfile({ name: 'Ben Park', photo: 'uploaded' });
    expect(await versionOf(ben)).toBe(2);
    // A signed URL is minted per second; step past the first one's.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const next = (await signAvatars(asUser(ana), [{ id: ben, version: 2 }]))[ben];
    expect(next).toMatch(/^http/);
    expect(next).not.toBe(first);
  });
});

describe('leaving and removing', () => {
  it('a member who left is initials to the pool', async () => {
    const left = await asUser(ben).rpc('leave_pool', { p_pool: pool, p_keep: true });
    expect(left.error).toBeNull();
    clearAvatarCache();
    const urls = await signAvatars(asUser(ana), [{ id: ben, version: 2 }]);
    expect(urls[ben]).toBeNull();
  });

  it('removing my photo removes the bytes and returns me to initials', async () => {
    as.user = ben;
    expect(await saveProfile({ name: 'Ben Park', photo: 'remove' })).toEqual({ ok: true });
    const row = (await asAdmin().from('profiles').select('*').eq('id', ben).single()).data!;
    expect(row.avatar_path).toBeNull();
    expect(row.avatar_version).toBeNull();
    const { data } = await asAdmin().storage.from(AVATAR_BUCKET).list('', { search: ben });
    expect(data ?? []).toHaveLength(0);
  });
});
