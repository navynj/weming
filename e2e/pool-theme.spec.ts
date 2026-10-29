import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';

import { asAdmin, asUser } from '../tests/as-user';

config({ path: '.env.local', quiet: true });

/**
 * A pool wears the colour I choose there in every mode (0062). Light and
 * pastel read the colour on the ground itself, and the pool's screen once
 * held the colour the server drew, so in a pool those two modes kept the
 * blue whatever was chosen; dark read it from <html> and was right. One
 * throwaway person and pool, removed after.
 */
const admin = asAdmin();
let me = '';
let pool = '';
let cookie = '';

/** The ground's words: the colour in light mode, its soft tone in pastel (globals.css). */
const WORDS = {
  light: { pink: 'rgb(229, 49, 140)', sky: 'rgb(11, 127, 194)' },
  pastel: { pink: 'rgb(222, 138, 207)', sky: 'rgb(89, 181, 239)' },
};

test.beforeAll(async () => {
  const email = `pool-theme-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  me = made.data.user.id;
  await admin
    .from('profiles')
    .insert({ id: me, display_name: 'Tea', timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ user_id: me, name: 'Day', icon: '🌊' });
  // Home stays dark blue: what the pool must not show.
  await admin
    .from('my_theme_settings')
    .upsert({ user_id: me, home_color: 'blue', mode: 'dark', apply_everywhere: false });
  const made2 = await asUser(me).rpc('create_pool', {
    p_name: 'Tint',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🏕', my_category_id: null }],
    p_include_history: false,
  });
  if (made2.error) throw made2.error;
  pool = made2.data!;
  await asUser(me)
    .from('member_pool_settings')
    .upsert({ pool_id: pool, user_id: me, theme: 'pink', theme_mode: 'light' });

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const verified = await fetch(link.data.properties.action_link, { redirect: 'manual' });
  const hash = new URLSearchParams(verified.headers.get('location')!.split('#')[1]);
  cookie =
    'base64-' +
    Buffer.from(
      JSON.stringify({
        access_token: hash.get('access_token'),
        refresh_token: hash.get('refresh_token'),
        token_type: 'bearer',
        expires_in: Number(hash.get('expires_in')),
        expires_at: Number(hash.get('expires_at')),
        user: link.data.user,
      }),
    ).toString('base64url');
});

test.afterAll(async () => {
  if (pool) await admin.from('pools').delete().eq('id', pool);
  if (me) await admin.auth.admin.deleteUser(me);
});

/** The ground's words, as the screen draws them. */
const ink = (page: Page) =>
  page.locator('main.water-ground').evaluate((el) => getComputedStyle(el).color);

for (const mode of ['light', 'pastel'] as const) {
  test(`a colour chosen in a pool is worn in ${mode} mode, from the first paint and when changed`, async ({
    page,
    baseURL,
  }, info) => {
    test.skip(info.project.name !== 'phone', 'one width is enough');
    test.setTimeout(120_000);
    await asUser(me)
      .from('member_pool_settings')
      .upsert({ pool_id: pool, user_id: me, theme: 'pink', theme_mode: mode });
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
    await page
      .context()
      .addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL! }]);
    // The first paint, before any script of the app's has run (the dev
    // server's styles come with those scripts, so only <html> is read here).
    await page.route('**/_next/static/chunks/**', (route) => route.abort());
    await page.goto(`/pool/${pool}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'pink');
    await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
    await page.unroute('**/_next/static/chunks/**');

    // Hydrated: the ground draws in the colour; then one picked in the
    // Theme tab is worn at once.
    await page.goto(`/pool/${pool}?settings=theme`);
    await expect.poll(() => ink(page), { timeout: 60_000 }).toBe(WORDS[mode].pink);
    const sky = page.locator('[data-theme-colors="mine"] [data-theme-swatch="sky"]');
    await expect(async () => {
      await sky.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'sky', { timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
    await expect.poll(() => ink(page)).toBe(WORDS[mode].sky);
  });
}
