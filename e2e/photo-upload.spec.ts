import { config } from 'dotenv';
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { splashPath } from '@/lib/routes';

config({ path: '.env.local', quiet: true });

/**
 * A photo from the picker to the page (2026-10-28), against the local stack
 * as a throwaway person: made ready in Chrome, sent by PUT to the URLs the
 * server issued, its display copy and thumbnail beside it (2026-10-30), its
 * size on the row, and its
 * box reserved on the post's page before it loads. Removed after.
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
  const email = `photo-upload-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  user = made.data.user.id;
  await admin
    .from('profiles')
    .insert({ id: user, display_name: 'Photographer', timezone: 'America/Vancouver' });
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
  if (user) {
    const { data } = await admin.storage.from('ripple-media').list(user); // storage-boundary: allow
    const paths = (data ?? []).map((o) => `${user}/${o.name}`);
    if (paths.length) await admin.storage.from('ripple-media').remove(paths); // storage-boundary: allow
  }
  if (splash) await admin.from('splashes').delete().eq('id', splash);
  if (user) await admin.auth.admin.deleteUser(user);
});

test('a picked photo goes up ready, with its display copy, thumbnail and size, and holds its box', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one browser run is enough');
  test.setTimeout(120_000);
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page.context().addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL! }]);
  await page.goto(splashPath(splash));

  // A 3000×2000 JPEG, made in the page so it is a real one.
  const jpeg = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 2000;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#0507C9';
    context.fillRect(0, 0, 3000, 2000);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.95));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });

  const puts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT') puts.push(request.headers()['content-type'] ?? '');
  });

  await page.getByRole('button', { name: 'Drop your words here' }).click();
  await page.locator('[data-media-input]').setInputFiles({
    name: 'walk.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(jpeg),
  });
  await expect(page.locator('[data-media-previews] img')).toHaveCount(1, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Save' }).click();

  // The row: one path in my folder, its size, its display copy's and thumbnail's.
  let row: { media: string[]; media_meta: unknown } | null = null;
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from('ripples')
          .select('media, media_meta')
          .eq('splash_id', splash)
          .maybeSingle();
        row = data;
        return data?.media.length ?? 0;
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  const [path] = row!.media;
  expect(path).toMatch(new RegExp(`^${user}/[0-9a-f-]{36}\\.webp$`));
  expect(row!.media_meta).toEqual({
    [path]: { w: 1600, h: 1067, d: { w: 1024, h: 683 }, t: { w: 400, h: 267 } },
  });
  expect(puts).toEqual(['image/webp', 'image/webp', 'image/webp']);

  // All three objects are there.
  const { data: objects } = await admin.storage.from('ripple-media').list(user); // storage-boundary: allow
  expect((objects ?? []).map((o) => `${user}/${o.name}`).sort()).toEqual(
    [path, path.replace(/\.webp$/, '.d.webp'), path.replace(/\.webp$/, '.t.webp')].sort(),
  );

  // On the page after a fresh load: the display copy, its box reserved.
  await page.reload();
  const photo = page.locator('img[data-photo]');
  await expect(photo).toHaveAttribute('width', '1600');
  await expect(photo).toHaveAttribute('height', '1067');
  await expect(photo).toHaveAttribute('src', /\.d\.webp/);
});
