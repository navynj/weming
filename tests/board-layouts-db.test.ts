import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BoardLayoutJson } from '@/features/month-board/board-layout';

import { asAdmin, asUser } from './as-user';

/**
 * The calendar's hand-set layouts (0025), against the real schema with
 * throwaway users: Ana opens a pool and a joint splash with two photos,
 * Ben joins, Cal stays outside. A pool layout is the members'; a Home
 * layout is its person's alone and, once there, ignores the pool's.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */
let ana: string;
let ben: string;
let cal: string;
let pool: string;
let lane: string;
let splash: string;
const PHOTO_A = 'a/photo.one.webp';
const PHOTO_B = 'a/photo.two.webp';

async function person(name: string): Promise<string> {
  const { data, error } = await asAdmin().auth.admin.createUser({
    email: `layouts-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  await asAdmin()
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, timezone: 'America/Vancouver' });
  return data.user.id;
}

/** A layout write, as a person: the RPC, the only way one is written. */
function set(
  who: string,
  patch: Record<string, unknown>,
  { pool: p = pool, clear = [] as string[] }: { pool?: string | null; clear?: string[] } = {},
) {
  return asUser(who).rpc('set_board_layout', {
    p_splash: splash,
    p_pool: p as string,
    p_patch: patch as never,
    p_clear: clear,
  });
}

async function read(who: string, scope: 'pool' | 'home') {
  const { data } = await asUser(who)
    .from('board_layouts')
    .select('layout, scope, user_id, pool_id')
    .eq('splash_id', splash)
    .eq('scope', scope);
  return (data ?? []) as unknown as {
    layout: BoardLayoutJson & { photos: Record<string, Record<string, number>> } & {
      label: { x: number; tilt: number };
    };
    scope: string;
    user_id: string | null;
    pool_id: string | null;
  }[];
}

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cal = await person('Cal');
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Layouts',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🏕', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  pool = made.data!;
  lane = (await asAdmin().from('pool_lanes').select('id').eq('pool_id', pool).single()).data!.id;
  const token = (await asUser(ana).rpc('create_invite', { p_pool: pool })).data![0].token;
  const joined = await asUser(ben).rpc('join_pool', {
    p_token: token,
    p_links: [],
    p_include_history: false,
  });
  if (joined.error) throw joined.error;
  splash = randomUUID();
  const opened = await asUser(ana).rpc('create_joint_splash', {
    p_id: splash,
    p_pool: pool,
    p_pool_lane: lane,
    p_title: 'A weekend',
  });
  if (opened.error) throw opened.error;
  const ripple = await asAdmin()
    .from('ripples')
    .insert({
      author_id: ana,
      splash_id: splash,
      category_id: null,
      note: 'two photos',
      media: [PHOTO_A, PHOTO_B],
    });
  if (ripple.error) throw ripple.error;
});

afterAll(async () => {
  const admin = asAdmin();
  if (pool) await admin.from('pools').delete().eq('id', pool);
  for (const id of [ana, ben, cal]) if (id) await admin.auth.admin.deleteUser(id);
});

describe('a pool layout', () => {
  it('is set by one member and seen by another', async () => {
    const written = await set(ana, { label: { x: 0.2, tilt: 5 } });
    expect(written.error).toBeNull();
    const seen = await read(ben, 'pool');
    expect(seen).toHaveLength(1);
    expect(seen[0].layout).toEqual({ label: { x: 0.2, tilt: 5 } });
  });

  it('is neither read nor written by someone outside the pool', async () => {
    expect(await read(cal, 'pool')).toHaveLength(0);
    const refused = await set(cal, { label: { y: 1 } });
    expect(refused.error).not.toBeNull();
    expect((await read(ana, 'pool'))[0].layout).toEqual({ label: { x: 0.2, tilt: 5 } });
  });

  it('merges deeply: two patches to different fields of one group both survive', async () => {
    await set(ana, { icon: { size: 2 } });
    await set(ben, { icon: { x: -0.3 } });
    expect((await read(ana, 'pool'))[0].layout.icon).toEqual({ size: 2, x: -0.3 });
    // The label set before is untouched.
    expect((await read(ana, 'pool'))[0].layout.label).toEqual({ x: 0.2, tilt: 5 });
  });

  it('patches one photo’s tilt, keeping its size and offsets, the other photo untouched', async () => {
    await set(ana, {
      photos: { [PHOTO_A]: { size: 0.6, x: 0.1, y: -1 }, [PHOTO_B]: { size: 0.8 } },
    });
    await set(ben, { photos: { [PHOTO_A]: { tilt: -7 } } });
    const photos = (await read(ana, 'pool'))[0].layout.photos;
    expect(photos[PHOTO_A]).toEqual({ size: 0.6, x: 0.1, y: -1, tilt: -7 });
    expect(photos[PHOTO_B]).toEqual({ size: 0.8 });
  });

  it('clears by dotted path: only that field goes', async () => {
    await set(ana, {}, { clear: ['icon.size'] });
    expect((await read(ana, 'pool'))[0].layout.icon).toEqual({ x: -0.3 });
    // A media path holds dots of its own; a photo's field is read off the end.
    await set(ana, {}, { clear: [`photos.${PHOTO_A}.tilt`] });
    expect((await read(ana, 'pool'))[0].layout.photos[PHOTO_A]).toEqual({
      size: 0.6,
      x: 0.1,
      y: -1,
    });
    await set(ana, {}, { clear: [`photos.${PHOTO_B}`] });
    expect((await read(ana, 'pool'))[0].layout.photos[PHOTO_B]).toBeUndefined();
    // A group left empty is gone.
    await set(ana, {}, { clear: ['icon.x'] });
    expect((await read(ana, 'pool'))[0].layout.icon).toBeUndefined();
  });

  it('drops photos whose media is no longer on the splash, on the next write', async () => {
    await asAdmin()
      .from('board_layouts')
      .update({
        layout: { photos: { 'gone/photo.webp': { size: 0.5 }, [PHOTO_A]: { size: 0.6 } } },
      })
      .eq('splash_id', splash)
      .eq('scope', 'pool');
    await set(ana, { label: { y: 0.5 } });
    const photos = (await read(ana, 'pool'))[0].layout.photos;
    expect(photos['gone/photo.webp']).toBeUndefined();
    expect(photos[PHOTO_A]).toEqual({ size: 0.6 });
  });

  it('refuses values outside the ranges, unknown keys, and a font size between whole pixels', async () => {
    for (const bad of [
      { icon: { size: 5 } },
      { icon: { x: 0.7 } },
      { label: { y: -6.5 } },
      { label: { tilt: 16 } },
      { label: { fontSize: 19 } },
      { label: { fontSize: 10.5 } },
      { photos: { [PHOTO_A]: { size: 0.2 } } },
      { wave: { weight: 5 } },
      { wave: { amp: 0 } },
      { wave: { length: 40 } },
      { wave: { span: 3 } },
      { colour: 'red' },
      { label: { colour: 'red' } },
      { icon: { inline: 'yes' } },
      { label: { width: 0.2 } },
      { label: { width: 2.5 } },
      { label: { style: 'blue' } },
      { label: { style: 'none' } },
      { label: { style: 1 } },
      { icon: { width: 1 } },
      { icon: { tilt: 16 } },
      { wave: { style: 'ink' } },
    ]) {
      const refused = await set(ana, bad);
      expect(refused.error, JSON.stringify(bad)).not.toBeNull();
    }
    expect(
      (
        await set(ana, {
          label: { fontSize: 18 },
          wave: { on: true, amp: 3, length: 16, weight: 2, span: 1.2, tilt: -4 },
        })
      ).error,
    ).toBeNull();
  });

  it('takes a label’s width and style and an icon’s tilt (0027), and clears them by path', async () => {
    expect((await set(ana, { icon: { tilt: -8 } })).error).toBeNull();
    await set(ana, {}, { clear: ['icon.tilt'] });
    expect((await read(ana, 'pool'))[0].layout.icon).toBeUndefined();
    expect((await set(ana, { label: { width: 1.5, style: 'ink' } })).error).toBeNull();
    expect((await read(ana, 'pool'))[0].layout.label).toMatchObject({ width: 1.5, style: 'ink' });
    await set(ana, {}, { clear: ['label.width', 'label.style'] });
    const label = (await read(ana, 'pool'))[0].layout.label;
    expect(label.width).toBeUndefined();
    expect(label.style).toBeUndefined();
  });
});

describe('a Home layout', () => {
  it('starts as a copy of the pool’s, is mine alone, and is not moved by later pool edits', async () => {
    const pooled = (await read(ana, 'pool'))[0].layout;
    expect((await set(ben, { icon: { inline: false } }, { pool: null })).error).toBeNull();
    const mine = await read(ben, 'home');
    expect(mine).toHaveLength(1);
    expect(mine[0].user_id).toBe(ben);
    expect(mine[0].layout).toEqual({ ...pooled, icon: { inline: false } });
    // Ana cannot see Ben's Home.
    expect(await read(ana, 'home')).toHaveLength(0);
    // A later pool edit leaves Ben's Home where it was.
    await set(ana, { label: { x: -0.5 } });
    expect((await read(ben, 'home'))[0].layout.label).toEqual(pooled.label);
  });

  it('is gone with "Use pool layout", the pool’s showing again', async () => {
    const { error } = await asUser(ben)
      .from('board_layouts')
      .delete()
      .eq('splash_id', splash)
      .eq('scope', 'home');
    expect(error).toBeNull();
    expect(await read(ben, 'home')).toHaveLength(0);
    expect((await read(ben, 'pool'))[0].layout.label.x).toBe(-0.5);
  });

  it('cannot be moved to another person or pool', async () => {
    await set(ben, { label: { y: 2 } }, { pool: null });
    const moved = await asUser(ben)
      .from('board_layouts')
      .update({ user_id: ana })
      .eq('splash_id', splash)
      .eq('scope', 'home')
      .select();
    expect(moved.error ?? (moved.data?.length === 0 ? 'refused' : null)).not.toBeNull();
  });
});

describe('after leaving the pool', () => {
  it('keeps the pool’s layout for its members and my Home layout for me; I no longer read the pool’s', async () => {
    const left = await asUser(ben).rpc('leave_pool', { p_pool: pool, p_keep: true });
    expect(left.error).toBeNull();
    expect(await read(ben, 'pool')).toHaveLength(0);
    expect(await read(ana, 'pool')).toHaveLength(1);
    expect(await read(ben, 'home')).toHaveLength(1);
  });
});
