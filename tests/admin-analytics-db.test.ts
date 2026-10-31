import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { anonymous, asAdmin, asUser } from './as-user';

/**
 * 0071 against the real schema (H71): opens and taps are written only as
 * their own person and read by nobody but the admin_* functions; invite
 * opens and link visits count; the views carry no content column; a locked
 * ripple is not pool activity; an untapped push followed by a direct open
 * reads as influenced.
 *
 * Needs the local stack; the db project runs it.
 */
let ana: string;
let ben: string;
let cy: string;
let pool: string;
let lane: string;
let token: string;
const people: string[] = [];

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `analytics-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  await admin
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, timezone: 'America/Vancouver' });
  people.push(data.user.id);
  return data.user.id;
}

async function jointSplash(title: string): Promise<string> {
  const id = crypto.randomUUID();
  const made = await asUser(ana).rpc('create_together_splash', {
    p_id: id,
    p_pool: pool,
    p_pool_lane: lane,
    p_title: title,
    p_icon: '',
    p_declared_start: null as unknown as string,
    p_invite_all: true,
  });
  if (made.error) throw made.error;
  return id;
}

beforeAll(async () => {
  ana = await person('Ana');
  ben = await person('Ben');
  cy = await person('Cy');
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Analytics crew',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🏕', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  pool = made.data!;
  lane = (await asUser(ana).from('pool_lanes').select('id').eq('pool_id', pool).single()).data!.id;
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
  await admin.from('ripples').delete().in('author_id', people);
  await admin.from('pools').delete().eq('id', pool);
  for (const id of people) await admin.auth.admin.deleteUser(id);
});

describe('who can reach what', () => {
  it('lets no API role but the service role call an admin_* function', async () => {
    for (const client of [anonymous(), asUser(ana)]) {
      const { error } = await client.rpc('admin_pool_events', { p_pool: pool });
      expect(error?.message).toMatch(/permission denied/);
      const counted = await client.rpc('count_invite_link_open', { p_token: token });
      expect(counted.error?.message).toMatch(/permission denied/);
    }
    const { error } = await asAdmin().rpc('admin_pool_events', { p_pool: pool });
    expect(error).toBeNull();
  });

  it('keeps the event tables unreadable through the API, even as their own person', async () => {
    for (const table of ['app_opens', 'invite_opens', 'invite_link_opens'] as const) {
      const { data, error } = await asUser(ben).from(table).select('*');
      expect(error?.message ?? (data ?? []).length === 0).toBeTruthy();
    }
  });
});

describe('opens and taps', () => {
  it("marks my own push tapped, and drops someone else's id as a direct open", async () => {
    await jointSplash('A secret title');
    const { data: notes } = await asAdmin()
      .from('notifications')
      .select('id, recipient_id')
      .eq('pool_id', pool)
      .eq('recipient_id', ben);
    const mine = notes![0].id;

    expect(
      (
        await asUser(ben).rpc('log_app_open', {
          p_source: 'notification',
          p_platform: 'ios-pwa',
          p_notification: mine,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await asUser(cy).rpc('log_app_open', {
          p_source: 'notification',
          p_platform: 'desktop-web',
          p_notification: mine,
        })
      ).error,
    ).toBeNull();

    const tapped = await asAdmin()
      .from('notifications')
      .select('clicked_at')
      .eq('id', mine)
      .single();
    expect(tapped.data!.clicked_at).not.toBeNull();
    const opens = (await asAdmin().rpc('admin_app_opens', { p_users: [ben, cy] })).data!;
    expect(opens.find((o) => o.user_id === ben)).toMatchObject({
      kind: 'notification',
      notification_pool_id: pool,
    });
    expect(opens.find((o) => o.user_id === cy)).toMatchObject({
      kind: 'direct',
      notification_pool_id: null,
    });
  });

  it('reads a direct open within 30 minutes of an untapped push as influenced', async () => {
    const record = await jointSplash('Another');
    const { data: note } = await asAdmin()
      .from('notifications')
      .select('id')
      .eq('splash_id', record)
      .eq('recipient_id', ben)
      .single();
    await asAdmin()
      .from('notifications')
      .update({ delivered_at: new Date(Date.now() - 5 * 60_000).toISOString() })
      .eq('id', note!.id);
    await asUser(ben).rpc('log_app_open', { p_source: 'direct', p_platform: 'ios-pwa' });

    const outcome = (await asAdmin().rpc('admin_notifications')).data!.find(
      (n) => n.notification_id === note!.id,
    );
    expect(outcome!.clicked_at).toBeNull();
    expect(outcome!.influenced_open_at).not.toBeNull();
    const kinds = (await asAdmin().rpc('admin_app_opens', { p_users: [ben] })).data!.map(
      (o) => o.kind,
    );
    expect(kinds).toContain('influenced');
  });
});

describe('invites', () => {
  it('records a signed-in open once, and counts every link visit with no visitor', async () => {
    await asUser(cy).rpc('record_invite_open', { p_token: token });
    await asUser(cy).rpc('record_invite_open', { p_token: token });
    // A member opening the link is not a new invitee.
    await asUser(ben).rpc('record_invite_open', { p_token: token });
    const reached = (await asAdmin().rpc('admin_pool_people', { p_pool: pool })).data!;
    expect(reached.find((p) => p.user_id === cy)).toMatchObject({
      joined_at: null,
      is_owner: false,
    });
    expect(reached.find((p) => p.user_id === ben)!.invited_at).toBe(
      reached.find((p) => p.user_id === ben)!.joined_at,
    );
    expect(reached.find((p) => p.user_id === ana)!.is_owner).toBe(true);

    await asAdmin().rpc('count_invite_link_open', { p_token: token });
    await asAdmin().rpc('count_invite_link_open', { p_token: token });
    await asAdmin().rpc('count_invite_link_open', { p_token: 'no-such-token' });
    const visits = (await asAdmin().rpc('admin_invite_link_visits')).data!.filter(
      (v) => v.pool_id === pool,
    );
    expect(visits).toHaveLength(2);
    expect(Object.keys(visits[0]).sort()).toEqual(['opened_at', 'pool_id']);
  });
});

describe('pool events', () => {
  it('carries ids, kinds, times and a photo flag, never content, and leaves locked ripples out', async () => {
    const record = await jointSplash('Title nobody should read');
    const events = (await asAdmin().rpc('admin_pool_events', { p_pool: pool })).data!;
    expect(
      events.some((e) => e.splash_id === record && e.kind === 'splash' && e.user_id === ana),
    ).toBe(true);
    for (const e of events) {
      expect(Object.keys(e).sort()).toEqual([
        'at',
        'has_media',
        'kind',
        'pool_id',
        'splash_id',
        'user_id',
      ]);
    }
    expect(JSON.stringify(events)).not.toContain('Title nobody should read');

    // A locked ripple on the record is nobody's pool activity.
    const ripple = crypto.randomUUID();
    const admin = asAdmin();
    const wrote = await admin
      .from('ripples')
      .insert({ id: ripple, author_id: ana, splash_id: record, note: 'private words' });
    if (wrote.error) throw wrote.error;
    const before = (await admin.rpc('admin_pool_events', { p_pool: pool })).data!.filter(
      (e) => e.kind === 'ripple',
    ).length;
    await admin.from('ripple_audience').insert({ ripple_id: ripple, target_type: 'lock' });
    const after = (await admin.rpc('admin_pool_events', { p_pool: pool })).data!.filter(
      (e) => e.kind === 'ripple',
    ).length;
    expect(after).toBe(before - 1);
  });
});
