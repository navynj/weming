import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { asAdmin, asUser } from './as-user';
import { poolSplashPath } from '@/lib/routes';

/**
 * The push path (H32) against the real schema: what a write leaves, the
 * dispatcher claims and sends once, with the words and URL only; a 410
 * deletes the subscription, a 500 is retried once and reported; a row found
 * too late is never pushed. Web Push itself is the one thing faked. Then the
 * bell's list, read through RLS as its recipient.
 *
 * Needs the local stack; the db project runs it.
 */

type Sent = { endpoint: string; body: string };
const sent: Sent[] = [];
const answers = new Map<string, number[]>();
const reported: string[] = [];

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, body: string) => {
      sent.push({ endpoint: sub.endpoint, body });
      const queue = answers.get(sub.endpoint) ?? [];
      const status = queue.shift();
      if (status && status >= 400)
        throw Object.assign(new Error('refused'), { statusCode: status });
    },
  },
}));
vi.mock('@/lib/report-failure', () => ({
  reportFailure: (op: string, error: unknown) =>
    reported.push(`${op}: ${error instanceof Error ? error.message : String(error)}`),
}));

let ana: string;
let ben: string;
let pool: string;
let lane: string;
const people: string[] = [];

async function person(name: string): Promise<string> {
  const admin = asAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: `push-${name}-${Date.now()}@during.today`,
    email_confirm: true,
  });
  if (error) throw error;
  await admin
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, timezone: 'America/Vancouver' });
  people.push(data.user.id);
  return data.user.id;
}

async function subscribe(who: string, endpoint: string): Promise<void> {
  const saved = await asUser(who).rpc('save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: 'BPublicKeyForTests',
    p_auth: 'authsecret',
  });
  if (saved.error) throw saved.error;
}

/** Ana makes a joint record with Everyone: Ben is invited. */
async function invite(title = 'Tofino'): Promise<string> {
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

let dispatchPushes: (actor: string) => Promise<void>;

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-public');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private');
  vi.stubEnv('VAPID_SUBJECT', 'mailto:test@during.today');
  ({ dispatchPushes } = await import('@/lib/notifications/dispatch'));
  ana = await person('Ana');
  ben = await person('Ben');
  const made = await asUser(ana).rpc('create_pool', {
    p_name: 'Crew',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🏕', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  pool = made.data!;
  lane = (await asUser(ana).from('pool_lanes').select('id').eq('pool_id', pool).single()).data!.id;
  const token = (await asUser(ana).rpc('create_invite', { p_pool: pool })).data![0].token;
  const joined = await asUser(ben).rpc('join_pool', {
    p_token: token,
    p_links: [],
    p_include_history: false,
  });
  if (joined.error) throw joined.error;
});

beforeEach(() => {
  sent.length = 0;
  reported.length = 0;
  answers.clear();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const admin = asAdmin();
  await admin.from('ripples').delete().in('author_id', people);
  await admin.from('pools').delete().eq('id', pool);
  for (const id of people) await admin.auth.admin.deleteUser(id);
});

describe('dispatching', () => {
  it('pushes an invite once, with who and where and the URL, never the title', async () => {
    const endpoint = `https://push.test/${crypto.randomUUID()}`;
    await subscribe(ben, endpoint);
    const record = await invite('Secret trip');
    await dispatchPushes(ana);
    expect(sent).toHaveLength(1);
    const payload = JSON.parse(sent[0].body);
    expect(payload).toMatchObject({
      title: 'Weming',
      body: 'Ana invited you to add your side in Crew',
      // In its pool (H42d): Home's reader reads only my own records.
      url: poolSplashPath(pool, record),
    });
    expect(sent[0].body).not.toContain('Secret trip');
    expect(payload.unread).toBeGreaterThanOrEqual(1);
    // Claimed: a second dispatcher has nothing left to send.
    await dispatchPushes(ana);
    expect(sent).toHaveLength(1);
    const used = await asAdmin()
      .from('push_subscriptions')
      .select('last_used_at')
      .eq('endpoint', endpoint)
      .single();
    expect(used.data!.last_used_at).not.toBeNull();
  });

  it('carries the title when the recipient shows titles', async () => {
    await asUser(ben)
      .from('notification_settings')
      .upsert({ user_id: ben, paused: false, show_titles: true });
    await invite('Tofino');
    await dispatchPushes(ana);
    expect(sent.length).toBeGreaterThan(0);
    for (const s of sent) {
      expect(JSON.parse(s.body).body).toBe('Ana invited you to add your side to “Tofino” in Crew');
    }
    await asUser(ben)
      .from('notification_settings')
      .upsert({ user_id: ben, paused: false, show_titles: false });
  });

  it('deletes a subscription the push service says is gone, without a retry', async () => {
    const gone = `https://push.test/${crypto.randomUUID()}`;
    await subscribe(ben, gone);
    answers.set(gone, [410]);
    await invite();
    await dispatchPushes(ana);
    expect(sent.filter((s) => s.endpoint === gone)).toHaveLength(1);
    const left = await asAdmin().from('push_subscriptions').select('id').eq('endpoint', gone);
    expect(left.data).toEqual([]);
    expect(reported).toEqual([]);
  });

  it('retries a failure once, then reports its status alone', async () => {
    const flaky = `https://push.test/${crypto.randomUUID()}`;
    await subscribe(ben, flaky);
    answers.set(flaky, [500, 500]);
    await invite();
    await dispatchPushes(ana);
    expect(sent.filter((s) => s.endpoint === flaky)).toHaveLength(2);
    expect(reported).toEqual(['push: push service answered 500']);
    expect(reported.join()).not.toContain('push.test');
    // Still there: a server error is not a dropped subscription.
    const kept = await asAdmin().from('push_subscriptions').select('id').eq('endpoint', flaky);
    expect(kept.data).toHaveLength(1);
    await asAdmin().from('push_subscriptions').delete().eq('endpoint', flaky);
  });

  it('never pushes a row found too late, and keeps it for the list', async () => {
    const record = await invite();
    await asAdmin()
      .from('notifications')
      .update({ created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() })
      .eq('splash_id', record);
    await dispatchPushes(ana);
    expect(sent).toEqual([]);
    const row = await asUser(ben)
      .from('notifications')
      .select('pushed_at')
      .eq('splash_id', record)
      .single();
    expect(row.data!.pushed_at).not.toBeNull();
  });

  it('pushes nothing for the actor’s own subscription', async () => {
    const mine = `https://push.test/${crypto.randomUUID()}`;
    await subscribe(ana, mine);
    await invite();
    await dispatchPushes(ana);
    expect(sent.some((s) => s.endpoint === mine)).toBe(false);
  });
});

describe('the bell’s list', () => {
  it('reads the recipient’s own, with face, pool and title, newest first', async () => {
    const { getNotifications, getUnreadCount } = await import('@/lib/queries/notifications');
    const record = await invite('Listed');
    const list = await getNotifications(asUser(ben) as never);
    expect(list[0]).toMatchObject({
      type: 'new_post',
      invited: true,
      actorName: 'Ana',
      poolName: 'Crew',
      title: 'Listed',
      splashId: record,
    });
    expect(await getUnreadCount(asUser(ben) as never)).toBeGreaterThan(0);
    expect(await getNotifications(asUser(ana) as never)).toEqual([]);
  });
});
