import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

config({ path: '.env.local', quiet: true });

/**
 * One write, one render (2026-10-28): a write's action revalidates and Next
 * re-renders the page into the action's own response, so the browser never
 * asks for the page again. A router.refresh() after each action used to
 * render every page twice. A throwaway person with one post, against the
 * local stack; both are removed after.
 */
const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

let user = '';
let splash = '';
let cookie = '';

test.beforeAll(async () => {
  const email = `one-write-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  user = made.data.user.id;
  await admin
    .from('profiles')
    .insert({ id: user, display_name: 'Writer', timezone: 'America/Vancouver' });
  const lane = await admin
    .from('my_categories')
    .insert({ user_id: user, name: 'Walks', icon: '🚶' })
    .select('id')
    .single();
  if (lane.error) throw lane.error;
  const post = await admin
    .from('splashes')
    .insert({ owner_id: user, created_by: user, title: 'A walk', declared_lane_id: lane.data.id })
    .select('id')
    .single();
  if (post.error) throw post.error;
  splash = post.data.id;

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
});

test.afterAll(async () => {
  if (splash) await admin.from('splashes').delete().eq('id', splash);
  if (user) await admin.auth.admin.deleteUser(user);
});

async function signIn(page: Page, baseURL: string): Promise<void> {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page.context().addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL }]);
}

test('pinning a post asks the server once: the action, no second render', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await signIn(page, baseURL!);
  await page.goto(`/splash/${splash}`);
  // The post's own header, in its sheet over Home (Home's top card has a
  // menu of its own, under the sheet).
  const header = page.locator('[data-splash-sheet] [data-splash-header]');
  const more = header.locator('[aria-label="More"]');
  await expect(more).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('networkidle');

  // Every request for this post's own page from here: the action, and any
  // render of it that is not a prefetch.
  const asked: string[] = [];
  page.on('request', (request) => {
    const headers = request.headers();
    if (new URL(request.url()).pathname !== `/splash/${splash}`) return;
    if (headers['next-action']) asked.push('action');
    else if (headers.rsc && !headers['next-router-prefetch']) asked.push('render');
  });

  await more.click();
  const answered = page.waitForResponse(
    (response) => !!response.request().headers()['next-action'],
  );
  await header.locator('[data-header-menu]').locator('button', { hasText: /^Pin$/ }).click();
  await answered;
  // Long enough for a refresh after the action to have gone out.
  await page.waitForTimeout(1_500);

  expect(asked).toEqual(['action']);
  const { data } = await admin.from('splashes').select('pinned_at').eq('id', splash).single();
  expect(data?.pinned_at).not.toBeNull();
  // The page shows it, from the action's own answer.
  await more.click();
  await expect(
    header.locator('[data-header-menu]').locator('button', { hasText: /^Unpin$/ }),
  ).toBeVisible();
});
