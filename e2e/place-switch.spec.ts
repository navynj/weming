import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

config({ path: '.env.local', quiet: true });

/**
 * Switching places (review): a place visited before is drawn from the
 * browser at once, with no round trip, and read again behind. A throwaway
 * person with one pool, against the local stack; nothing of anyone else's is
 * read or touched, and both are removed after.
 */
const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

let user = '';
let pool = '';
let cookie = '';

test.beforeAll(async () => {
  const email = `place-switch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  user = made.data.user.id;
  await admin
    .from('profiles')
    .insert({ id: user, display_name: 'Switcher', timezone: 'America/Vancouver' });

  // A real session, as the sign-in callback would set it.
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
    user: made.data.user,
  };
  cookie = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');

  const as = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    },
  );
  const created = await as.rpc('create_pool', {
    p_name: 'Switch',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Walks', icon: '🚶', my_category_id: null }],
    p_include_history: false,
  });
  if (created.error) throw created.error;
  pool = created.data!;
});

test.afterAll(async () => {
  if (pool) await admin.from('pools').delete().eq('id', pool);
  if (user) await admin.auth.admin.deleteUser(user);
});

async function signIn(page: Page, baseURL: string): Promise<void> {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page.context().addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL }]);
}

const place = (page: Page, selector: string) => page.locator(`${selector}:visible`).first();

test('a pool visited before comes back without a round trip', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  await signIn(page, baseURL!);
  await page.goto('/');
  await expect(place(page, `[data-strip-pool="${pool}"]`)).toBeVisible({ timeout: 60_000 });

  // There and back once: both places are now in the browser.
  await place(page, `[data-strip-pool="${pool}"]`).click();
  await expect(page.locator(`[data-pool-ground="${pool}"]`)).toBeVisible({ timeout: 60_000 });
  await place(page, '[data-strip-home]').click();
  await expect(page.locator('[data-strip-home][data-strip-current]:visible')).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForLoadState('networkidle');

  // From here a navigation to the pool would have to wait on the server:
  // hold every such request, so only the browser's copy can draw it.
  // Prefetches pass; the refresh behind the switch is held too.
  const held: string[] = [];
  await page.route(`**/pool/${pool}**`, (route) => {
    const headers = route.request().headers();
    if (headers.rsc && !headers['next-router-prefetch']) {
      held.push(route.request().url());
      return; // never answered
    }
    return route.continue();
  });
  // A full reload would lose this.
  await page.evaluate(() => ((window as unknown as { stayed: boolean }).stayed = true));

  await place(page, `[data-strip-pool="${pool}"]`).click();
  await expect(page.locator(`[data-pool-ground="${pool}"]`)).toBeVisible({ timeout: 2_000 });
  expect(await page.locator('[data-board-skeleton]').count()).toBe(0);
  expect(
    await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed === true),
  ).toBe(true);
  // Only the refresh behind the drawn board may have asked, after it was drawn.
  expect(held.length).toBeLessThanOrEqual(1);
});
