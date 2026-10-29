import { config } from 'dotenv';
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { lanePath, splashPath } from '@/lib/routes';

config({ path: '.env.local', quiet: true });

/**
 * Short ids in URLs (H62), against the local stack as a throwaway person: a
 * link carries the short id, an old uuid link lands on it, and a malformed
 * id is the same not-found as a missing record. Removed after.
 */
const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

let user = '';
let splash = '';
let laneId = '';
let cookie = '';

test.beforeAll(async () => {
  const email = `short-id-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  user = made.data.user.id;
  await admin
    .from('profiles')
    .insert({ id: user, display_name: 'Shorty', timezone: 'America/Vancouver' });
  const lane = await admin
    .from('my_categories')
    .insert({ user_id: user, name: 'Walks', icon: '🚶' })
    .select('id')
    .single();
  if (lane.error) throw lane.error;
  laneId = lane.data.id;
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

test('a uuid link lands on its short id; a malformed id is a missing one', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one browser run is enough');
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page.context().addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL! }]);

  await page.goto(`/splash/${splash}`);
  expect(new URL(page.url()).pathname).toBe(splashPath(splash));
  await expect(page.getByText('A walk').first()).toBeVisible();

  await page.goto(`/lane/${laneId.toUpperCase()}`);
  expect(new URL(page.url()).pathname).toBe(lanePath(laneId));

  // A lane that is not there and an id that is not one: the same 404.
  const missing = await page.goto(lanePath(crypto.randomUUID()));
  const malformed = await page.goto('/lane/not-an-id');
  expect(missing!.status()).toBe(404);
  expect(malformed!.status()).toBe(missing!.status());

  // A post that is not there and an id that is not one: the same answer.
  const gone = await page.goto(splashPath(crypto.randomUUID()));
  const goneText = await page.locator('[data-splash-gone]').count();
  const bad = await page.goto('/splash/not-an-id');
  expect(bad!.status()).toBe(gone!.status());
  expect(await page.locator('[data-splash-gone]').count()).toBe(goneText);
});
