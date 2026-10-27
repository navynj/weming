import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * The edit sheet's loader and save (review), against the real schema with a
 * throwaway user: a splash's days are its own (H24), read and written on
 * the splash; its ripples carry none.
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
      supabase.auth.getUser = (async () => ({
        data: { user: { id: as.user } },
        error: null,
      })) as unknown as typeof supabase.auth.getUser;
      return supabase;
    },
  };
});

import { loadSplashEdit, saveSplashEdit } from '@/features/splash-sheet/edit-actions';

const LANE = crypto.randomUUID();
const DROPPED = crypto.randomUUID();
const RANGED = crypto.randomUUID();
let me: string;
let first: string;
const OWN = crypto.randomUUID();
let pool: string;
let lanes: Record<string, string> = {};

beforeAll(async () => {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `edit-date-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  me = data.user.id;
  as.user = me;
  await admin
    .from('profiles')
    .insert({ id: me, display_name: 'Ana', timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ id: LANE, user_id: me, name: 'Day', icon: '🖋' });
  const client = asUser(me);

  // As the composer drops it (H24): the date and lane on the splash, the
  // ripple carrying neither.
  await client.from('splashes').insert({
    id: DROPPED,
    owner_id: me,
    title: 'Coffee',
    declared_start: '2026-10-20',
    declared_lane_id: LANE,
  });
  first = (
    await client
      .from('ripples')
      .insert({ author_id: me, note: 'flat white', splash_id: DROPPED })
      .select('id')
      .single()
  ).data!.id;

  await client.from('splashes').insert({
    id: RANGED,
    owner_id: me,
    title: 'Whistler',
    declared_start: '2026-10-10',
    declared_end: '2026-10-12',
    declared_lane_id: LANE,
  });

  const made = await client.rpc('create_pool', {
    p_name: 'Edit pool',
    p_kind: null as unknown as 'friends',
    p_lanes: [
      { name: 'Food', icon: '🍽️', my_category_id: null },
      { name: 'Media', icon: '🎬', my_category_id: null },
    ],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  pool = made.data!;
  lanes = Object.fromEntries(
    (await client.from('pool_lanes').select('id, name').eq('pool_id', pool)).data!.map((l) => [
      l.name,
      l.id,
    ]),
  );
  const own = await client.rpc('create_own_pool_splash', {
    p_id: OWN,
    p_pool: pool,
    p_pool_lane: lanes.Food,
    p_title: 'Mine here',
  });
  if (own.error) throw own.error;
});

afterAll(async () => {
  const admin = asAdmin();
  if (me) {
    await admin.from('ripples').delete().eq('author_id', me);
    await admin.from('splashes').delete().eq('owner_id', me);
  }
  if (pool) await admin.from('pools').delete().eq('id', pool);
  if (me) await admin.auth.admin.deleteUser(me);
});

const base = {
  icon: null,
  declaredLaneId: null,
  share: [],
  poolId: null,
  poolLaneId: null,
};

describe('the edit sheet’s date', () => {
  it('reads a dropped splash’s day from the splash, days only', async () => {
    const state = await loadSplashEdit(DROPPED);
    expect(state).toMatchObject({
      ok: true,
      kind: 'mine',
      annotation: { date: '2026-10-20', time: null, endDate: null, endTime: null },
    });
    expect(state).not.toHaveProperty('date');
  });

  it('saves the edited days onto the splash, touching no ripple (H24)', async () => {
    const done = await saveSplashEdit({
      ...base,
      id: DROPPED,
      kind: 'mine',
      title: 'Coffee',
      declaredLaneId: LANE,
      declaredStart: '2026-10-21',
      declaredEnd: null,
    });
    expect(done).toEqual({ ok: true });
    const splash = (await asUser(me).from('splashes').select('*').eq('id', DROPPED).single()).data!;
    expect(splash.declared_start).toBe('2026-10-21');
    const row = (await asUser(me).from('ripples').select('*').eq('id', first).single()).data!;
    expect(row).toMatchObject({ occurred_on: null, occurred_time: null });
  });

  it('reads a declared range as its days', async () => {
    expect(await loadSplashEdit(RANGED)).toMatchObject({
      annotation: { date: '2026-10-10', time: null, endDate: '2026-10-12', endTime: null },
    });
  });
});

describe('a pool’s own splash in the edit sheet (0020)', () => {
  it('offers its pool’s lanes and moves a Just-mine splash within them', async () => {
    const state = await loadSplashEdit(OWN);
    expect(state).toMatchObject({ kind: 'own', poolLaneId: lanes.Food });
    expect(state.ok && state.poolLanes.map((l) => l.name)).toEqual(['Food', 'Media']);
    const done = await saveSplashEdit({
      ...base,
      id: OWN,
      kind: 'own',
      title: 'Mine here',
      declaredStart: null,
      declaredEnd: null,
      poolId: pool,
      poolLaneId: lanes.Media,
    });
    expect(done).toEqual({ ok: true });
    const placed = (
      await asUser(me)
        .from('splash_placements')
        .select('pool_lane_id')
        .eq('splash_id', OWN)
        .single()
    ).data!;
    expect(placed.pool_lane_id).toBe(lanes.Media);
  });
});

describe('renaming a pool (0021)', () => {
  it('is its creator’s, trimmed', async () => {
    const { error } = await asUser(me).rpc('rename_pool', { p_pool: pool, p_name: '  Edited  ' });
    expect(error).toBeNull();
    const row = (await asUser(me).from('pools').select('name').eq('id', pool).single()).data!;
    expect(row.name).toBe('Edited');
  });
});
