import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * The storage adapter (lib/storage, 2026-10-28) against the local stack's
 * real storage, and the actions that issue upload URLs through it: the
 * Supabase backend does what the interface says; media paths are minted in
 * the signed-in person's folder; a pool's photo goes up and comes down only
 * for a current member (H38); deleting a pool takes its photo; a ripple's
 * sizes are stored only for the paths it names (0070).
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */
const as = vi.hoisted(() => ({ user: '' }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, refresh: () => {} }));
vi.mock('@/lib/supabase/server', async () => {
  const { asUser: client } = await import('./as-user');
  return {
    createClient: async () => {
      const supabase = client(as.user);
      supabase.auth.getUser = (async () => ({
        data: { user: { id: as.user } },
        error: null,
      })) as unknown as typeof supabase.auth.getUser;
      return supabase;
    },
  };
});

import { commitRipple } from '@/features/input-sheet/commit';
import { requestMediaUploads } from '@/features/input-sheet/upload-actions';
import {
  deletePool,
  removePoolPhoto,
  requestPoolPhotoUpload,
  setPoolPhoto,
} from '@/features/pool/actions';
import { MEDIA_BUCKET } from '@/lib/media-bucket';
import { POOL_PHOTO_BUCKET } from '@/lib/pool-photo-bucket';
import { listAll, storage } from '@/lib/storage';
import { putSigned } from '@/lib/storage/upload';

const PHOTO = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
const people: string[] = [];
const pools: string[] = [];

async function person(name: string): Promise<string> {
  const { data, error } = await asAdmin().auth.admin.createUser({
    email: `adapter-${name}-${crypto.randomUUID()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  await asAdmin()
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, timezone: 'America/Vancouver' });
  people.push(data.user.id);
  return data.user.id;
}

async function openPool(owner: string, members: string[]): Promise<string> {
  const made = await asUser(owner).rpc('create_pool', {
    p_name: 'Adapter',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🧭', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  const id = made.data!;
  pools.push(id);
  if (members.length > 0) {
    const token = (await asUser(owner).rpc('create_invite', { p_pool: id })).data![0].token;
    for (const who of members) {
      const joined = await asUser(who).rpc('join_pool', {
        p_token: token,
        p_links: [],
        p_include_history: false,
      });
      if (joined.error) throw joined.error;
    }
  }
  return id;
}

let ana: string;
let ben: string;
let cal: string;

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cal = await person('Cal');
});

afterAll(async () => {
  const admin = asAdmin();
  for (const id of people) {
    const mine = await listAll(storage(), MEDIA_BUCKET, `${id}/`);
    await storage().remove(
      MEDIA_BUCKET,
      mine.map((o) => o.path),
    );
  }
  await storage().remove(POOL_PHOTO_BUCKET, pools);
  for (const id of pools) await admin.from('pools').delete().eq('id', id);
  for (const id of people) await admin.auth.admin.deleteUser(id);
});

describe('the Supabase backend', () => {
  it('puts, stats, signs, copies, lists by prefix a page at a time, and removes', async () => {
    const backend = storage();
    const folder = `${ana}/`;
    const paths = [0, 1, 2].map((i) => `${folder}adapter-${i}.webp`);
    for (const path of paths) {
      await backend.put(MEDIA_BUCKET, path, PHOTO, { contentType: 'image/webp' });
    }
    const info = await backend.stat(MEDIA_BUCKET, paths[0]);
    expect(info).toMatchObject({ path: paths[0], size: PHOTO.length, contentType: 'image/webp' });
    expect(await backend.stat(MEDIA_BUCKET, `${folder}absent.webp`)).toBeNull();

    const signed = await backend.signedReadUrls(MEDIA_BUCKET, paths, 60);
    expect(signed.size).toBe(3);
    const read = await fetch(signed.get(paths[1])!);
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(PHOTO);
    expect(await backend.get(MEDIA_BUCKET, paths[2])).toEqual(PHOTO);

    await backend.copy(MEDIA_BUCKET, paths[0], `${folder}adapter-copy.webp`);
    // Two at a time, so the cursor is followed.
    const first = await backend.list(MEDIA_BUCKET, folder, { limit: 2 });
    expect(first.objects).toHaveLength(2);
    expect(first.cursor).not.toBeNull();
    const all = await listAll(backend, MEDIA_BUCKET, folder);
    expect(all.map((o) => o.path).sort()).toEqual([...paths, `${folder}adapter-copy.webp`].sort());

    await backend.remove(MEDIA_BUCKET, [...paths, `${folder}adapter-copy.webp`, `${folder}never`]);
    expect(await listAll(backend, MEDIA_BUCKET, folder)).toEqual([]);
  });

  it('issues no upload URL over an object already there unless asked to replace it', async () => {
    const backend = storage();
    const path = `${ana}/once.webp`;
    await backend.put(MEDIA_BUCKET, path, PHOTO, { contentType: 'image/webp' });
    try {
      await expect(
        backend.signedUploadUrl(MEDIA_BUCKET, path, { contentType: 'image/webp' }),
      ).rejects.toThrow(/exists/);
      const upload = await backend.signedUploadUrl(MEDIA_BUCKET, path, {
        contentType: 'image/webp',
        upsert: true,
      });
      expect(await putSigned(upload, new Blob([PHOTO], { type: 'image/webp' }))).toBeNull();
    } finally {
      await backend.remove(MEDIA_BUCKET, [path]);
    }
  });
});

describe('media uploads', () => {
  it('mints each path in my own folder and takes the bytes by PUT, with its display copy', async () => {
    as.user = ana;
    const asked = await requestMediaUploads([{ type: 'image/webp', display: true }]);
    expect(asked.ok).toBe(true);
    if (!asked.ok) return;
    const [issued] = asked.uploads;
    expect(issued.path).toMatch(new RegExp(`^${ana}/[0-9a-f-]{36}\\.webp$`));
    const blob = new Blob([PHOTO], { type: 'image/webp' });
    expect(await putSigned(issued.upload, blob)).toBeNull();
    expect(await putSigned(issued.display!, blob)).toBeNull();
    const there = (await listAll(storage(), MEDIA_BUCKET, `${ana}/`)).map((o) => o.path);
    expect(there).toContain(issued.path);
    expect(there).toContain(issued.path.replace(/\.webp$/, '.d.webp'));
  });

  it('refuses a type it does not keep', async () => {
    as.user = ana;
    const asked = await requestMediaUploads([
      { type: 'image/svg+xml' as 'image/webp', display: false },
    ]);
    expect(asked.ok).toBe(false);
  });

  it('stores sizes only for the paths the ripple names', async () => {
    as.user = ana;
    const path = `${ana}/sized.webp`;
    // A ripple belongs to a splash.
    const lane = (
      await asAdmin()
        .from('my_categories')
        .insert({ user_id: ana, name: 'Day' })
        .select('id')
        .single()
    ).data!.id;
    const splashId = crypto.randomUUID();
    const made = await asUser(ana)
      .from('splashes')
      .insert({ id: splashId, owner_id: ana, title: 'Sized', declared_lane_id: lane });
    expect(made.error).toBeNull();
    const done = await commitRipple({
      categoryId: null,
      note: 'sized',
      media: [path],
      mediaMeta: {
        [path]: { w: 2048, h: 1536, d: { w: 1024, h: 768 } },
        [`${ana}/not-on-it.webp`]: { w: 1, h: 1 },
      },
      occurredOn: null,
      occurredTime: null,
      startInstant: null,
      endInstant: null,
      splashId,
    });
    expect(done).toMatchObject({ ok: true });
    if (!done.ok) return;
    const row = await asUser(ana)
      .from('ripples')
      .select('media_meta')
      .eq('id', done.rippleId)
      .single();
    expect(row.data!.media_meta).toEqual({ [path]: { w: 2048, h: 1536, d: { w: 1024, h: 768 } } });
    // Someone who may not see the ripple reads nothing of it, sizes included.
    const theirs = await asUser(cal).from('ripples').select('media_meta').eq('id', done.rippleId);
    expect(theirs.data).toEqual([]);
  });
});

describe('a pool’s photo (H38)', () => {
  it('goes up for a current member and is refused to anyone outside', async () => {
    const pool = await openPool(ana, [ben]);
    as.user = cal;
    expect(await requestPoolPhotoUpload(pool, 'image/webp')).toMatchObject({ ok: false });

    as.user = ben;
    const asked = await requestPoolPhotoUpload(pool, 'image/webp');
    expect(asked.ok).toBe(true);
    if (!asked.ok) return;
    expect(await putSigned(asked.upload, new Blob([PHOTO], { type: 'image/webp' }))).toBeNull();
    expect(await setPoolPhoto(pool, true)).toEqual({ ok: true });
    expect(await storage().stat(POOL_PHOTO_BUCKET, pool)).not.toBeNull();

    // Cal cannot take it down; Ben can, row and bytes.
    as.user = cal;
    expect(await removePoolPhoto(pool)).toMatchObject({ ok: false });
    expect(await storage().stat(POOL_PHOTO_BUCKET, pool)).not.toBeNull();
    as.user = ben;
    expect(await removePoolPhoto(pool)).toEqual({ ok: true });
    expect(await storage().stat(POOL_PHOTO_BUCKET, pool)).toBeNull();
    const row = await asAdmin().from('pools').select('photo_path').eq('id', pool).single();
    expect(row.data!.photo_path).toBeNull();
  });

  it('goes with the pool when the pool is deleted', async () => {
    const pool = await openPool(ana, []);
    as.user = ana;
    const asked = await requestPoolPhotoUpload(pool, 'image/webp');
    if (!asked.ok) throw new Error(asked.message);
    expect(await putSigned(asked.upload, new Blob([PHOTO], { type: 'image/webp' }))).toBeNull();
    expect(await setPoolPhoto(pool, true)).toEqual({ ok: true });

    expect(await deletePool(pool)).toEqual({ ok: true });
    expect(await storage().stat(POOL_PHOTO_BUCKET, pool)).toBeNull();
  });
});
