import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';

import { asAdmin, asUser } from '../tests/as-user';

config({ path: '.env.local', quiet: true });

/**
 * Opening a notification (H42d): every type opens its record, at the reply
 * or the block it is about, from Home's bell and from the pool's. Two
 * throwaway people in one pool, against the local stack; nothing of anyone
 * else's is read or touched, and both are removed after.
 */
const admin = asAdmin();

let ana = '';
let ben = '';
let pool = '';
let lane = '';
let cookie = '';

/** What Ana's bell holds, and where each must open. */
type Case = { name: string; splash: string; title: string; anchor: string | null };
const cases: Case[] = [];

async function person(name: string): Promise<{ id: string; email: string }> {
  const email = `notify-open-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  const id = made.data.user.id;
  await admin.from('profiles').insert({ id, display_name: name, timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ user_id: id, name: 'Day', icon: '🌊' });
  return { id, email };
}

/** A real session for Ana, as the sign-in callback would set it. */
async function sessionCookie(email: string): Promise<string> {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const verified = await fetch(link.data.properties.action_link, { redirect: 'manual' });
  const hash = new URLSearchParams(verified.headers.get('location')!.split('#')[1]);
  const session = {
    access_token: hash.get('access_token'),
    refresh_token: hash.get('refresh_token'),
    token_type: 'bearer',
    expires_in: Number(hash.get('expires_in')),
    expires_at: Number(hash.get('expires_at')),
    user: link.data.user,
  };
  return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
}

function ok<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}

/** A block; `side` for one on someone else's record, which carries its pool. */
async function ripple(who: string, splash: string, note: string, side = false): Promise<string> {
  return ok(
    await asUser(who)
      .from('ripples')
      .insert({ author_id: who, note, splash_id: splash, thread_pool_id: side ? pool : null })
      .select('id')
      .single(),
  ).id;
}

async function reply(who: string, rid: string, body: string): Promise<string> {
  return ok(
    await asUser(who).rpc('add_reply', {
      p_ripple: rid,
      p_body: body,
      p_id: crypto.randomUUID(),
      p_pool: pool,
    }),
  )!;
}

async function ownPoolRecord(who: string, title: string): Promise<string> {
  const id = crypto.randomUUID();
  ok(
    await asUser(who).rpc('create_own_pool_splash', {
      p_id: id,
      p_pool: pool,
      p_pool_lane: lane,
      p_title: title,
    }),
  );
  return id;
}

test.beforeAll(async () => {
  test.setTimeout(60_000);
  const a = await person('Ana');
  const b = await person('Ben');
  ana = a.id;
  ben = b.id;
  cookie = await sessionCookie(a.email);

  pool = ok(
    await asUser(ana).rpc('create_pool', {
      p_name: 'Notify',
      p_kind: null as unknown as 'friends',
      p_lanes: [{ name: 'Trips', icon: '🏕', my_category_id: null }],
      p_include_history: false,
    }),
  )!;
  lane = ok(await asUser(ana).from('pool_lanes').select('id').eq('pool_id', pool).single()).id;
  const token = ok(await asUser(ana).rpc('create_invite', { p_pool: pool }))![0].token;
  ok(await asUser(ben).rpc('join_pool', { p_token: token, p_links: [], p_include_history: false }));
  // Every type reaches Ana's bell.
  for (const [type, value] of [
    ['new_post', 'all'],
    ['reply', 'on'],
    ['reaction', 'on'],
  ] as const) {
    ok(
      await asUser(ana)
        .from('member_notification_prefs')
        .upsert({ pool_id: pool, user_id: ana, type, value }),
    );
  }

  // An invite: Ben's record together, Ana asked to add her side.
  const tofino = crypto.randomUUID();
  ok(
    await asUser(ben).rpc('create_together_splash', {
      p_id: tofino,
      p_pool: pool,
      p_pool_lane: lane,
      p_title: 'Tofino',
      p_icon: '',
      p_declared_start: null as unknown as string,
      p_invite_all: false,
    }),
  );
  ok(await asUser(ben).rpc('add_joint_invitees', { p_splash: tofino, p_users: [ana] }));
  await ripple(ben, tofino, 'Ben’s side');
  cases.push({ name: 'an invite', splash: tofino, title: 'Tofino', anchor: null });

  // A new post: Ben's own record in the pool.
  const walk = await ownPoolRecord(ben, 'Night walk');
  await ripple(ben, walk, 'Down to the water');
  cases.push({ name: 'a new post', splash: walk, title: 'Night walk', anchor: null });

  // A reply on my record: Ana's own in the pool, Ben replying to her block.
  const mine = await ownPoolRecord(ana, 'Ana’s soup');
  const soup = await ripple(ana, mine, 'Miso, again');
  const onMine = await reply(ben, soup, 'Looks good');
  cases.push({
    name: 'a reply on my record',
    splash: mine,
    title: 'Ana’s soup',
    anchor: `reply-${onMine}`,
  });

  // A reply on theirs: Ana's side on Ben's record, Ben replying to it.
  const side = await ripple(ana, tofino, 'My side of Tofino');
  const onTheirs = await reply(ben, side, 'Yes!');
  cases.push({
    name: 'a reply on their record',
    splash: tofino,
    title: 'Tofino',
    anchor: `reply-${onTheirs}`,
  });

  // A reaction on my block.
  ok(
    await asUser(ben)
      .from('ripple_reactions')
      .insert({ ripple_id: soup, user_id: ben, emoji: '👏', thread_pool_id: pool }),
  );
  cases.push({ name: 'a reaction', splash: mine, title: 'Ana’s soup', anchor: `block-${soup}` });
});

test.afterAll(async () => {
  if (pool) await admin.from('pools').delete().eq('id', pool);
  for (const id of [ana, ben].filter(Boolean)) {
    await admin.from('ripples').delete().eq('author_id', id);
    await admin.from('splashes').delete().eq('owner_id', id);
    await admin.auth.admin.deleteUser(id);
  }
});

async function signIn(page: Page, baseURL: string): Promise<void> {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page.context().addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL }]);
}

/** Ana's notification about this case, as the bell lists it. */
async function notificationFor(c: Case): Promise<string> {
  const rows = ok(
    await admin
      .from('notifications')
      .select('id, type, invited, reply_id, ripple_id')
      .eq('recipient_id', ana)
      .eq('splash_id', c.splash),
  );
  const row = rows.find((r) =>
    c.anchor?.startsWith('reply-')
      ? r.reply_id === c.anchor.slice('reply-'.length)
      : c.anchor?.startsWith('block-')
        ? r.type === 'reaction'
        : r.type === 'new_post',
  );
  expect(row, c.name).toBeTruthy();
  return row!.id;
}

for (const from of ['Home', 'the pool'] as const) {
  test(`every notification opens its record at its reply or block, from ${from}`, async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(240_000);
    await signIn(page, baseURL!);
    for (const c of cases) {
      const id = await notificationFor(c);
      await page.goto(from === 'Home' ? '/' : `/pool/${pool}`);
      const bell = page.locator('[data-notifications-bell]:visible').first();
      await expect(bell).toBeVisible({ timeout: 90_000 });
      await bell.click();
      await page.locator(`[data-notification="${id}"]`).click();

      const sheet = page.locator('[data-splash-page]:visible').first();
      await expect(sheet, `${c.name} from ${from}`).toBeVisible({ timeout: 60_000 });
      await expect(sheet).toContainText(c.title);
      expect(await page.locator('[data-splash-gone]').count(), c.name).toBe(0);
      expect(new URL(page.url()).pathname, c.name).toContain(c.splash);
      if (c.anchor) {
        await expect(page.locator(`[id="${c.anchor}"]`), `${c.name} at its anchor`).toBeVisible();
        await expect(page.locator(`[id="${c.anchor}"]`)).toBeInViewport();
      }
    }
  });
}

test('a notification opens its sheet at once, and its page lands in place at the reply', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const c = cases.find((x) => x.anchor?.startsWith('reply-'))!;
  const id = await notificationFor(c);
  await signIn(page, baseURL!);
  // The record's page, prefetch and navigation alike, held back.
  const DELAY_MS = 3_000;
  await page.route(
    (url) => url.pathname === `/pool/${pool}/splash/${c.splash}`,
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      await route.continue();
    },
  );
  await page.goto('/');
  const bell = page.locator('[data-notifications-bell]:visible').first();
  await expect(bell).toBeVisible({ timeout: 90_000 });
  await bell.click();
  const row = page.locator(`[data-notification="${id}"]`);
  await expect(row).toBeVisible();

  // When the tap lands, when the opening sheet's header is on the page, and
  // whether any sheet rises or leaves after the page arrives.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__tap = null;
    w.__header = null;
    w.__adopted = null;
    w.__ghosts = 0;
    document.addEventListener('click', () => (w.__tap ??= performance.now()), { capture: true });
    new MutationObserver(() => {
      if (
        w.__tap !== null &&
        w.__header === null &&
        document.querySelector('[data-opening-title]')
      ) {
        w.__header = performance.now();
      }
      const page = document.querySelector('[data-splash-modal] [data-splash-page]');
      if (page && w.__adopted === null) {
        const sheet = page.closest<HTMLElement>('[data-splash-sheet]')!;
        w.__adopted = getComputedStyle(sheet).transform;
      }
      if (document.querySelector('[data-splash-leaving]')) w.__ghosts = 1;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await row.click();

  const opening = page.locator('[data-splash-opening]');
  await expect(opening).toBeVisible();
  await expect(opening.locator('[data-opening-title]')).toHaveText(c.title);
  await expect(opening.locator('[data-splash-skeleton]')).toBeVisible();
  const { tap, header } = await page.evaluate(() => {
    const w = window as unknown as { __tap: number; __header: number };
    return { tap: w.__tap, header: w.__header };
  });
  expect(header - tap, 'the header and skeleton within 100ms of the tap').toBeLessThan(100);
  // The page is still on its way: the skeleton holds, no other sheet.
  await expect(page.locator('[data-splash-page]')).toHaveCount(0);

  const landed = page.locator('[data-splash-page]:visible');
  await expect(landed).toBeVisible({ timeout: 60_000 });
  await expect(landed).toContainText(c.title);
  await expect(opening).toHaveCount(0);
  await expect(page.locator('[data-splash-modal]')).toHaveCount(1);
  await expect(page.locator(`[id="${c.anchor}"]`)).toBeInViewport();
  const { adopted, ghosts } = await page.evaluate(() => {
    const w = window as unknown as { __adopted: string; __ghosts: number };
    return { adopted: w.__adopted, ghosts: w.__ghosts };
  });
  // Taken over where it stood: no second rise, no exit played.
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(adopted);
  expect(ghosts).toBe(0);
});
