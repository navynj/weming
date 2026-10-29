import { config } from 'dotenv';
import { expect, test } from '@playwright/test';
import { createClient, type User } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { signInName } from '@/features/auth/sign-in-name';

config({ path: '.env.local', quiet: true });

/**
 * A name is global (H60): a Google sign-up opening an invite sees the name it
 * joins as, never a field to change it. Against the local stack with
 * throwaway people; the joiner's profile is made as the callback makes it,
 * from Google's metadata. Removed after.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const people: string[] = [];
let pool = '';
let token = '';
let cookie = '';

async function person(metadata: Record<string, string>, name?: string) {
  const email = `join-name-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (made.error) throw made.error;
  people.push(made.data.user.id);
  const display = name ?? signInName(made.data.user.user_metadata, email);
  await admin
    .from('profiles')
    .insert({ id: made.data.user.id, display_name: display, timezone: 'America/Vancouver' });
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const verified = await fetch(link.data.properties.action_link, { redirect: 'manual' });
  const hash = new URLSearchParams(verified.headers.get('location')!.split('#')[1]);
  return { user: made.data.user, hash };
}

function sessionCookie(user: User, hash: URLSearchParams): string {
  const session = {
    access_token: hash.get('access_token'),
    refresh_token: hash.get('refresh_token'),
    token_type: 'bearer',
    expires_in: Number(hash.get('expires_in')),
    expires_at: Number(hash.get('expires_at')),
    user,
  };
  return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
}

test.beforeAll(async () => {
  const host = await person({}, 'Host');
  const asHost = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${host.hash.get('access_token')}` } },
  });
  const made = await asHost.rpc('create_pool', {
    p_name: 'Names',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🏕', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  pool = made.data!;
  const invite = await asHost.rpc('create_invite', { p_pool: pool });
  if (invite.error) throw invite.error;
  token = invite.data![0].token;

  const google = await person({ full_name: 'Sora Kim', name: 'Sora Kim' });
  cookie = sessionCookie(google.user, google.hash);
});

test.afterAll(async () => {
  if (pool) await admin.from('pools').delete().eq('id', pool);
  for (const id of people) await admin.auth.admin.deleteUser(id);
});

test('a Google sign-up joins as its name, with no field to change it', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one browser run is enough');
  const ref = new URL(url).hostname.split('.')[0];
  await page.context().addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL! }]);
  await page.goto(`/join/${token}`);

  await expect(page.locator('[data-join-as-name]')).toHaveText('Sora Kim');
  await expect(page.locator('[data-join-name]')).toHaveCount(0);
  await expect(page.locator('input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change in Settings' })).toBeVisible();
});
