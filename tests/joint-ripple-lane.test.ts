import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * Adding a ripple to a joint splash from the pool's splash page (H24):
 * `addBlock` writes no lane at all, whatever the link. Where the splash shows
 * on my Home is derived from the home-lane marker (homeLaneFor, 0033): my
 * lane marked as its pool lane's home lane, else the pool's column — a link
 * without the marker, or no link at all. The database agrees (_home_lane_for).
 *
 * The real action against the real schema, as a throwaway member. Needs the
 * local stack; excluded from the CI config like every DB test.
 */
// Real v4 ids: the action's zod schema refuses the fixtures' all-zero pattern.
const ANA_TRIPS = crypto.randomUUID();

let ana: string;
let pool: string;
let trips: string;
let days: string;
const joints: string[] = [];

const as = vi.hoisted(() => ({ user: '' }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
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

import { homeLaneFor } from '@/features/pool/links';
import { addBlock } from '@/features/splash/block-actions';

beforeAll(async () => {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `joint-lane-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  ana = data.user.id;
  as.user = ana;
  await admin
    .from('profiles')
    .insert({ id: ana, display_name: 'Ana', timezone: 'America/Vancouver' });
  await admin
    .from('my_categories')
    .insert([{ id: ANA_TRIPS, user_id: ana, name: 'Trips', icon: '•' }]);
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Joint lanes',
    p_kind: null as unknown as 'friends',
    p_lanes: [
      { name: 'Trips', icon: '🏕', my_category_id: ANA_TRIPS },
      { name: 'Days', icon: '📓', my_category_id: null },
    ],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  pool = made.data!;
  const lanes = (await asUser(ana).from('pool_lanes').select('id, name').eq('pool_id', pool)).data!;
  trips = lanes.find((l) => l.name === 'Trips')!.id;
  days = lanes.find((l) => l.name === 'Days')!.id;
});

afterAll(async () => {
  const admin = asAdmin();
  if (ana) await admin.from('ripples').delete().eq('author_id', ana);
  if (joints.length) await admin.from('splashes').delete().in('id', joints);
  if (pool) await admin.from('pools').delete().eq('id', pool);
  if (ana) await admin.auth.admin.deleteUser(ana);
});

/**
 * Links Trips, marked home or not, opens a joint splash on `poolLane`, adds
 * a ripple from its page: the ripple's own lane, and the splash's Home lane.
 */
async function addTo(
  poolLane: 'trips' | 'days',
  home: boolean,
): Promise<{ ripple: string | null; home: string | null }> {
  const linked = await asUser(ana).rpc('set_lane_links', {
    p_pool: pool,
    p_links: [{ pool_lane_id: trips, my_category_id: ANA_TRIPS, is_home: home }],
  });
  expect(linked.error).toBeNull();
  const id = crypto.randomUUID();
  joints.push(id);
  const opened = await asUser(ana).rpc('create_joint_splash', {
    p_id: id,
    p_pool: pool,
    p_pool_lane: poolLane === 'trips' ? trips : days,
    p_title: `${poolLane} ${home ? 'home' : 'linked'}`,
  });
  expect(opened.error).toBeNull();
  const done = await addBlock({
    id: crypto.randomUUID(),
    note: 'from the splash page',
    media: [],
    splashId: id,
  });
  expect(done).toMatchObject({ ok: true });
  const row = await asUser(ana)
    .from('ripples')
    .select('category_id')
    .eq('id', done.ok ? done.rippleId : '')
    .single();
  const links = (
    await asUser(ana)
      .from('lane_mappings')
      .select('my_category_id, pool_lane_id, is_home')
      .eq('pool_id', pool)
  ).data!.map((l) => ({
    myCategoryId: l.my_category_id,
    poolLaneId: l.pool_lane_id,
    isHome: l.is_home,
  }));
  const shown = homeLaneFor(poolLane === 'trips' ? trips : days, links);
  // The database's copy (delete_pool reads it) agrees with the app's.
  const db = await asAdmin().rpc('_home_lane_for' as never, { sid: id, uid: ana } as never);
  expect((db.data as string | null) ?? null).toBe(shown);
  return { ripple: row.data!.category_id, home: shown };
}

describe('a ripple added to a joint splash (H24)', () => {
  it('home lane marked: no lane of its own; the splash shows in my home lane', async () => {
    expect(await addTo('trips', true)).toEqual({ ripple: null, home: ANA_TRIPS });
  });

  it('linked, no home lane: no lane of its own; the pool’s column', async () => {
    expect(await addTo('trips', false)).toEqual({ ripple: null, home: null });
  });

  it('unlinked pool lane: no lane of its own; the pool’s column', async () => {
    expect(await addTo('days', true)).toEqual({ ripple: null, home: null });
  });
});
