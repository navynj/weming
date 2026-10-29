import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asAdmin, asUser } from './as-user';
import { othersLeave } from './pool-helpers';
import { getPoolActivity } from '@/lib/queries/pools';

/**
 * Replies and reactions follow threads (0053): the leak found in production,
 * as a test. Ana's own record is shared to two pools — Alpha with Ben, Beta
 * with Cal. Cal's reply and reaction, written in Beta, reach Beta's members,
 * Ana (the owner) and Cal; never Ben, who shares only Alpha. Ana's own reply
 * from no pool reaches both. Notifications follow the same line.
 *
 * Needs the local stack; excluded from the CI config like every DB test.
 */

let ana: string;
let ben: string;
let cal: string;
let alpha: string;
let beta: string;
let record: string;
let ripple: string;
const people: string[] = [];
const pools: string[] = [];

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `thread-${name.toLowerCase()}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
  people.push(id);
  return id;
}

/** Ana's pool with one lane, `who` joined; the record shared there. */
async function poolWith(name: string, who: string): Promise<string> {
  const created = await asUser(ana).rpc('create_pool', {
    p_name: name,
    p_kind: 'friends',
    p_lanes: [{ name: 'Days', icon: '☀️', my_category_id: null }],
    p_include_history: false,
  });
  expect(created.error).toBeNull();
  const id = created.data!;
  pools.push(id);
  const invite = await asUser(ana).rpc('create_invite', { p_pool: id });
  const joined = await asUser(who).rpc('join_pool', {
    p_token: invite.data![0].token,
    p_links: [],
    p_include_history: false,
  });
  expect(joined.error).toBeNull();
  const lane = (await asUser(ana).from('pool_lanes').select('id').eq('pool_id', id)).data![0].id;
  const placed = await asUser(ana)
    .from('splash_placements')
    .insert({ splash_id: record, pool_id: id, pool_lane_id: lane });
  expect(placed.error).toBeNull();
  return id;
}

const replies = async (who: string) =>
  ((await asUser(who).rpc('ripple_replies_in', { p_ripples: [ripple] })).data ?? []) as {
    id: string;
    author_id: string;
    thread_pool_id: string | null;
  }[];
const reactions = async (who: string) =>
  (
    await asUser(who)
      .from('ripple_reactions')
      .select('user_id, thread_pool_id')
      .eq('ripple_id', ripple)
  ).data ?? [];

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cal = await person('Cal');
  record = crypto.randomUUID();
  const days = await asAdmin()
    .from('my_categories')
    .insert({ user_id: ana, name: 'Days' })
    .select('id')
    .single();
  const made = await asUser(ana)
    .from('splashes')
    .insert({ id: record, owner_id: ana, title: 'mine', declared_lane_id: days.data!.id });
  expect(made.error).toBeNull();
  ripple = (
    await asUser(ana)
      .from('ripples')
      .insert({ author_id: ana, note: 'Ana wrote', splash_id: record })
      .select('id')
      .single()
  ).data!.id;
  alpha = await poolWith('Alpha', ben);
  beta = await poolWith('Beta', cal);
});

afterAll(async () => {
  const admin = asAdmin();
  await admin.from('splashes').delete().eq('id', record);
  for (const id of pools) await admin.from('pools').delete().eq('id', id);
  for (const id of people) await admin.auth.admin.deleteUser(id);
});

describe('the pool dot follows the thread too (review)', () => {
  it('lights only the pool a reaction was left in, not another the record is in', async () => {
    const left = await asUser(cal)
      .from('ripple_reactions')
      .insert({ ripple_id: ripple, user_id: cal, emoji: '👀', thread_pool_id: beta });
    expect(left.error).toBeNull();
    try {
      const activity = await getPoolActivity(asUser(ana), ana, [alpha, beta]);
      expect(activity.has(beta)).toBe(true);
      // Ben, in Alpha, cannot see it: Alpha has nothing new for Ana.
      expect(activity.has(alpha)).toBe(false);
    } finally {
      await asAdmin()
        .from('ripple_reactions')
        .delete()
        .eq('ripple_id', ripple)
        .eq('user_id', cal)
        .eq('emoji', '👀');
    }
  });
});

describe('a reply belongs to the pool it was written in (0053)', () => {
  let calsReply: string;
  let bensReply: string;

  it('takes the pool it is written from', async () => {
    calsReply = crypto.randomUUID();
    const { error } = await asUser(cal).rpc('add_reply', {
      p_ripple: ripple,
      p_body: 'from Beta',
      p_id: calsReply,
      p_pool: beta,
    });
    expect(error).toBeNull();
    const row = await asAdmin()
      .from('ripple_replies')
      .select('thread_pool_id')
      .eq('id', calsReply)
      .single();
    expect(row.data!.thread_pool_id).toBe(beta);
  });

  it('is never read by a member of another pool the record is in (the leak)', async () => {
    expect((await replies(ben)).map((r) => r.id)).not.toContain(calsReply);
    const old = await asUser(ben).rpc('ripple_replies_for', { p_ripples: [ripple] });
    expect((old.data ?? []).map((r) => r.id)).not.toContain(calsReply);
  });

  it('is read by its pool, the record’s owner and its writer', async () => {
    for (const who of [cal, ana])
      expect((await replies(who)).map((r) => r.id)).toContain(calsReply);
  });

  it('cannot be written into a pool its writer is not in', async () => {
    const { error } = await asUser(cal).rpc('add_reply', {
      p_ripple: ripple,
      p_body: 'into Alpha',
      p_id: crypto.randomUUID(),
      p_pool: alpha,
    });
    expect(error).not.toBeNull();
  });

  it('from the app in production (no pool), takes the writer’s pool with the record', async () => {
    bensReply = crypto.randomUUID();
    const { error } = await asUser(ben).rpc('add_reply', {
      p_ripple: ripple,
      p_body: 'old app',
      p_id: bensReply,
    });
    expect(error).toBeNull();
    const row = await asAdmin()
      .from('ripple_replies')
      .select('thread_pool_id')
      .eq('id', bensReply)
      .single();
    expect(row.data!.thread_pool_id).toBe(alpha);
    expect((await replies(cal)).map((r) => r.id)).not.toContain(bensReply);
  });

  it('by the owner from no pool, reaches every pool', async () => {
    const id = crypto.randomUUID();
    const { error } = await asUser(ana).rpc('add_reply', {
      p_ripple: ripple,
      p_body: 'mine',
      p_id: id,
      p_pool: null as unknown as string,
    });
    expect(error).toBeNull();
    for (const who of [ben, cal]) expect((await replies(who)).map((r) => r.id)).toContain(id);
  });

  it('stays in its pool', async () => {
    const moved = await asAdmin()
      .from('ripple_replies')
      .update({ thread_pool_id: alpha })
      .eq('id', calsReply);
    expect(moved.error).not.toBeNull();
  });
});

describe('a reaction belongs to the pool it was left in (0053)', () => {
  it('is never read by a member of another pool the record is in', async () => {
    const left = await asUser(cal)
      .from('ripple_reactions')
      .insert({ ripple_id: ripple, user_id: cal, emoji: '🔥', thread_pool_id: beta });
    expect(left.error).toBeNull();
    expect((await reactions(ben)).map((r) => r.user_id)).not.toContain(cal);
    expect((await reactions(ana)).map((r) => r.user_id)).toContain(cal);
  });

  it('without a pool (the app in production), takes the writer’s pool with the record', async () => {
    const left = await asUser(ben)
      .from('ripple_reactions')
      .insert({ ripple_id: ripple, user_id: ben, emoji: '👏' });
    expect(left.error).toBeNull();
    const mine = (await reactions(ben)).find((r) => r.user_id === ben);
    expect(mine?.thread_pool_id).toBe(alpha);
    expect((await reactions(cal)).map((r) => r.user_id)).not.toContain(ben);
  });
});

describe('notifications follow the thread (0053)', () => {
  it('a reply notifies nobody outside its pool, even someone who replied before', async () => {
    const before = crypto.randomUUID();
    await asUser(ben).rpc('add_reply', {
      p_ripple: ripple,
      p_body: 'again',
      p_id: before,
      p_pool: alpha,
    });
    const reply = crypto.randomUUID();
    await asUser(cal).rpc('add_reply', {
      p_ripple: ripple,
      p_body: 'later',
      p_id: reply,
      p_pool: beta,
    });
    const sent = await asAdmin()
      .from('notifications')
      .select('recipient_id, pool_id')
      .eq('reply_id', reply);
    const recipients = (sent.data ?? []).map((n) => n.recipient_id);
    expect(recipients).not.toContain(ben);
    expect((sent.data ?? []).every((n) => n.pool_id === beta)).toBe(true);
  });
});

describe('a deleted pool’s thread is closed, never deleted (0054)', () => {
  it('keeps its replies and reactions, read by the owner and their writer only', async () => {
    const written = (
      await asAdmin().from('ripple_replies').select('id').eq('thread_pool_id', beta)
    ).data!.map((r) => r.id);
    expect(written.length).toBeGreaterThan(0);
    await othersLeave(beta, ana);
    const gone = await asUser(ana).rpc('delete_pool', { p_pool: beta });
    expect(gone.error).toBeNull();
    pools.splice(pools.indexOf(beta), 1);

    const kept = await asAdmin()
      .from('ripple_replies')
      .select('id, thread_pool_id, thread_closed')
      .in('id', written);
    expect(kept.data).toHaveLength(written.length);
    expect(kept.data!.every((r) => r.thread_closed && r.thread_pool_id === null)).toBe(true);

    // Ben still reads the ripple through Alpha: a null pool must not open it to him.
    expect((await replies(ben)).some((r) => written.includes(r.id))).toBe(false);
    expect((await reactions(ben)).map((r) => r.user_id)).not.toContain(cal);
    expect((await replies(ana)).map((r) => r.id)).toEqual(expect.arrayContaining(written));
    expect((await reactions(ana)).map((r) => r.user_id)).toContain(cal);
    expect((await replies(cal)).some((r) => written.includes(r.id))).toBe(true);
  });

  it('cannot be reopened or closed by hand', async () => {
    const closed = (
      await asAdmin().from('ripple_replies').select('id').eq('thread_closed', true).limit(1)
    ).data![0].id;
    const reopened = await asAdmin()
      .from('ripple_replies')
      .update({ thread_pool_id: alpha, thread_closed: false })
      .eq('id', closed);
    expect(reopened.error).not.toBeNull();
  });
});
