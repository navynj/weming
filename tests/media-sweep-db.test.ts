import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin } from './as-user';
import { photoOf, sweepMedia, sweepSummary } from '@/lib/media-sweep';
import { createStorage } from '@/lib/storage/backend';
import type { Bucket } from '@/lib/storage/types';

/**
 * The daily media sweep (H70) against the real schema and storage: what no
 * row names and is older than a day goes, copies included; what a row names,
 * or what is younger, stays. Scoped to this test's own objects: the local
 * buckets hold other tests' files and real records.
 *
 * Needs the local stack; the db project runs it.
 */
const storage = createStorage({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});
const DAY = 24 * 60 * 60 * 1000;
const later = Date.now() + 2 * DAY;

let ana: string;
let bare: string;
let pool: string;
let splash: string;
const mine: { bucket: Bucket; path: string }[] = [];
const scope = (bucket: Bucket, path: string) =>
  mine.some((o) => o.bucket === bucket && o.path === path);

async function put(bucket: Bucket, path: string): Promise<string> {
  await storage.put(bucket, path, new Uint8Array([1, 2, 3]), { contentType: 'image/webp' });
  mine.push({ bucket, path });
  return path;
}

async function exists(bucket: Bucket, path: string): Promise<boolean> {
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const { objects } = await storage.list(bucket, folder, { cursor: null });
  return objects.some((o) => o.path === path);
}

async function person(name: string): Promise<string> {
  const { data, error } = await asAdmin().auth.admin.createUser({
    email: `sweep-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  await asAdmin()
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, timezone: 'Asia/Seoul' });
  return data.user.id;
}

let named: string;
let unnamed: string;

beforeAll(async () => {
  const admin = asAdmin();
  ana = await person('Ana');
  bare = await person('Bare');
  const lane = await admin
    .from('my_categories')
    .insert({ user_id: ana, name: 'Walks', icon: '🚶' })
    .select('id')
    .single();
  if (lane.error) throw lane.error;
  const made = await admin
    .from('splashes')
    .insert({ owner_id: ana, created_by: ana, title: 'Kept', declared_lane_id: lane.data.id })
    .select('id')
    .single();
  if (made.error) throw made.error;
  splash = made.data.id;
  const created = await admin
    .from('pools')
    .insert({ name: 'Sweep', owner_id: ana })
    .select('id')
    .single();
  if (created.error) throw created.error;
  pool = created.data.id;

  // A named photo with both copies; an unnamed one with both copies.
  named = await put('ripple-media', `${ana}/${crypto.randomUUID()}.webp`);
  await put('ripple-media', named.replace('.webp', '.d.webp'));
  await put('ripple-media', named.replace('.webp', '.t.webp'));
  unnamed = await put('ripple-media', `${ana}/${crypto.randomUUID()}.webp`);
  await put('ripple-media', unnamed.replace('.webp', '.d.webp'));
  await put('ripple-media', unnamed.replace('.webp', '.t.webp'));
  const ripple = await admin
    .from('ripples')
    .insert({ author_id: ana, splash_id: splash, media: [named] });
  if (ripple.error) throw ripple.error;

  // A face a profile names, and one nobody's profile does; a pool's photo it does not name.
  await put('avatars', ana);
  await admin.from('profiles').update({ avatar_path: ana, avatar_version: 1 }).eq('id', ana);
  await put('avatars', bare);
  await put('pool-photos', pool);
});

afterAll(async () => {
  const admin = asAdmin();
  for (const bucket of ['ripple-media', 'avatars', 'pool-photos'] as const) {
    const left = mine.filter((o) => o.bucket === bucket).map((o) => o.path);
    if (left.length) await storage.remove(bucket, left);
  }
  await admin.from('splashes').delete().eq('id', splash);
  await admin.from('pools').delete().eq('id', pool);
  for (const id of [ana, bare]) await admin.auth.admin.deleteUser(id);
});

describe('the media sweep', () => {
  it('reads a copy as its photo’s', () => {
    expect(photoOf('u/a.d.webp')).toBe('u/a.webp');
    expect(photoOf('u/a.t.png')).toBe('u/a.png');
    expect(photoOf('u/a.webp')).toBe('u/a.webp');
    expect(photoOf('6789c88e-20261024_145328.jpg')).toBe('6789c88e-20261024_145328.jpg');
  });

  it('leaves everything under a day old', async () => {
    const report = await sweepMedia({ storage, db: asAdmin(), dryRun: true, scope });
    expect(report.buckets['ripple-media']).toMatchObject({ orphans: 0, young: 3 });
    expect(report.buckets.avatars).toMatchObject({ orphans: 0, young: 1 });
    expect(report.buckets['pool-photos']).toMatchObject({ orphans: 0, young: 1 });
  });

  it('counts in a dry run and removes nothing', async () => {
    const report = await sweepMedia({ storage, db: asAdmin(), dryRun: true, now: later, scope });
    expect(report.buckets['ripple-media']).toMatchObject({ stored: 6, orphans: 3, bytes: 9 });
    expect(report.buckets.avatars.orphans).toBe(1);
    expect(report.buckets['pool-photos'].orphans).toBe(1);
    expect(await exists('ripple-media', unnamed)).toBe(true);
    // Counts only: nothing in the log names a path or a person.
    expect(sweepSummary(report)).not.toMatch(new RegExp(`${ana}|${bare}|${pool}`));
  });

  it('removes the unnamed with their copies, and keeps what a row names', async () => {
    await sweepMedia({ storage, db: asAdmin(), dryRun: false, now: later, scope });
    expect(await exists('ripple-media', unnamed)).toBe(false);
    expect(await exists('ripple-media', unnamed.replace('.webp', '.t.webp'))).toBe(false);
    expect(await exists('ripple-media', named)).toBe(true);
    expect(await exists('ripple-media', named.replace('.webp', '.d.webp'))).toBe(true);
    expect(await exists('avatars', ana)).toBe(true);
    expect(await exists('avatars', bare)).toBe(false);
    expect(await exists('pool-photos', pool)).toBe(false);
  });

  it('holds a bucket where most of it looks unnamed: a bad read, not orphans', async () => {
    const folder = crypto.randomUUID();
    for (let i = 0; i < 21; i++) await put('ripple-media', `${folder}/${i}.webp`);
    const inFolder = (bucket: Bucket, path: string) =>
      bucket === 'ripple-media' && path.startsWith(`${folder}/`);
    const report = await sweepMedia({
      storage,
      db: asAdmin(),
      dryRun: false,
      now: later,
      scope: inFolder,
    });
    expect(report.buckets['ripple-media']).toMatchObject({ orphans: 21, held: true });
    expect(await exists('ripple-media', `${folder}/0.webp`)).toBe(true);
  });
});
