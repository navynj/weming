import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { asAdmin, asUser } from './as-user';

/**
 * A record's lane through the edit sheet's save (0033), against the real
 * schema with throwaway users. Ana opens Sarang (Word, Free) and Study
 * (Play); Ben joins Sarang. Nothing converts a record's kind any more
 * (H45): a lane change moves no placement.
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

import { saveSplashEdit } from '@/features/splash-sheet/edit-actions';

const CHURCH = crypto.randomUUID();
const DAY = crypto.randomUUID();
let ana: string;
let ben: string;
let sarang: string;
let study: string;
const lane: Record<string, string> = {};

async function person(name: string): Promise<string> {
  const { data, error } = await asAdmin().auth.admin.createUser({
    email: `convert-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  await asAdmin()
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, timezone: 'America/Vancouver' });
  return data.user.id;
}

/** A splash of Ana's in Church with one ripple, shared to the pools given. */
async function anas(shareTo: [string, string][], pinned = false): Promise<string> {
  const id = crypto.randomUUID();
  await asUser(ana)
    .from('splashes')
    .insert({
      id,
      owner_id: ana,
      title: 'mine',
      declared_lane_id: CHURCH,
      pinned_at: pinned ? new Date().toISOString() : null,
    });
  await asUser(ana).from('ripples').insert({ author_id: ana, note: 'Ana wrote', splash_id: id });
  for (const [pool, poolLane] of shareTo) {
    const { error } = await asUser(ana)
      .from('splash_placements')
      .insert({ splash_id: id, pool_id: pool, pool_lane_id: poolLane });
    if (error) throw error;
  }
  return id;
}

const base = {
  title: 'mine',
  icon: null,
  declaredStart: null,
  declaredEnd: null,
  declaredLaneId: null,
  share: [],
  block: null,
  poolLaneId: null,
};

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  await asAdmin()
    .from('my_categories')
    .insert([
      { id: CHURCH, user_id: ana, name: 'Church', icon: '⛪' },
      { id: DAY, user_id: ana, name: 'Day', icon: '🖋' },
    ]);
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Sarang',
    p_kind: null as unknown as 'friends',
    p_lanes: [
      { name: 'Word', icon: '📖', my_category_id: null },
      { name: 'Free', icon: '🕊', my_category_id: null },
    ],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  sarang = made.data!;
  const other = await asUser(ana).rpc('create_pool', {
    p_name: 'Study',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Play', icon: '🃏', my_category_id: null }],
    p_include_history: false,
  });
  if (other.error) throw other.error;
  study = other.data!;
  for (const row of (
    await asUser(ana).from('pool_lanes').select('id, name').in('pool_id', [sarang, study])
  ).data!) {
    lane[row.name] = row.id;
  }
  const token = (await asUser(ana).rpc('create_invite', { p_pool: sarang })).data![0].token;
  const joined = await asUser(ben).rpc('join_pool', {
    p_token: token,
    p_links: [],
    p_include_history: false,
  });
  if (joined.error) throw joined.error;
});

afterAll(async () => {
  const admin = asAdmin();
  for (const id of [sarang, study].filter(Boolean)) {
    await admin.from('splashes').delete().eq('pool_id', id);
    await admin.from('pools').delete().eq('id', id);
  }
  for (const id of [ana, ben].filter(Boolean)) {
    await admin.from('ripples').delete().eq('author_id', id);
    await admin.from('splashes').delete().eq('owner_id', id);
    await admin.auth.admin.deleteUser(id);
  }
});

const row = async (id: string) =>
  (await asAdmin().from('splashes').select('*').eq('id', id).single()).data!;
const placementsOf = async (id: string) =>
  (
    await asAdmin()
      .from('splash_placements')
      .select('pool_id, pool_lane_id, shared')
      .eq('splash_id', id)
  ).data!;

describe('my shared record changes lane from Home', () => {
  it('moves no placement: every pool keeps it where it was (0033)', async () => {
    as.user = ana;
    const id = await anas([
      [sarang, lane.Word],
      [study, lane.Play],
    ]);
    const done = await saveSplashEdit({
      ...base,
      id,
      kind: 'mine',
      declaredLaneId: DAY,
      poolId: null,
      conversion: { op: 'set_lane', myLaneId: DAY, placeOn: null },
    });
    expect(done).toEqual({ ok: true });
    const placed = await placementsOf(id);
    expect(placed.sort((a, b) => a.pool_id.localeCompare(b.pool_id))).toEqual(
      [
        { pool_id: sarang, pool_lane_id: lane.Word, shared: true },
        { pool_id: study, pool_lane_id: lane.Play, shared: true },
      ].sort((a, b) => a.pool_id.localeCompare(b.pool_id)),
    );
    expect((await row(id)).declared_lane_id).toBe(DAY);
  });
});
