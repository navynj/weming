import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

import type { Database } from '@/lib/database.types';
import { splashPath } from '@/lib/routes';

config({ path: '.env.local', quiet: true });

/**
 * Each photo fetched once a session (2026-10-30), against the local stack as
 * a throwaway person: Home, a reload, the post's page, back, and a reload
 * again. A URL kept per copy (lib/media-url-cache.ts, lib/signed-media-
 * objects.ts) lets the browser's cache answer every time after the first;
 * five-minute URLs signed afresh fetched the same photo three times a
 * session. Boards and cards load the thumbnail, the page the display copy.
 * A face and a pool's photo too (lib/avatars.ts): one URL per version.
 */
const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

let user = '';
let pool = '';
let splash = '';
let cookie = '';
const paths: string[] = [];

async function webp(w: number, h: number, hue: number): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: hue, g: 80, b: 200 } },
  })
    .webp({ quality: 82 })
    .toBuffer();
}

test.beforeAll(async () => {
  const email = `fetch-once-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  user = made.data.user.id;
  await admin
    .from('profiles')
    .insert({ id: user, display_name: 'Once', timezone: 'America/Vancouver' });
  const lane = await admin
    .from('my_categories')
    .insert({ user_id: user, name: 'Walks', icon: '🚶' })
    .select('id')
    .single();
  if (lane.error) throw lane.error;
  const post = await admin
    .from('splashes')
    .insert({
      owner_id: user,
      created_by: user,
      title: 'Two photos',
      declared_lane_id: lane.data.id,
    })
    .select('id')
    .single();
  if (post.error) throw post.error;
  splash = post.data.id;

  // Two photos with every copy an upload makes now, cached as an upload says.
  const meta: { [path: string]: { [k: string]: number | { w: number; h: number } } } = {};
  for (const hue of [40, 160]) {
    const path = `${user}/${crypto.randomUUID()}.webp`;
    for (const [suffix, w, h] of [
      ['', 1600, 1200],
      ['.d', 1024, 768],
      ['.t', 400, 300],
    ] as const) {
      const { error } = await admin.storage // storage-boundary: allow
        .from('ripple-media')
        .upload(path.replace(/\.webp$/, `${suffix}.webp`), await webp(w, h, hue), {
          contentType: 'image/webp',
          cacheControl: '31536000',
        });
      if (error) throw error;
    }
    meta[path] = { w: 1600, h: 1200, d: { w: 1024, h: 768 }, t: { w: 400, h: 300 } };
    paths.push(path);
  }
  const ripple = await admin
    .from('ripples')
    .insert({ author_id: user, splash_id: splash, note: 'A walk', media: paths, media_meta: meta });
  if (ripple.error) throw ripple.error;

  // My face, and a pool of mine with its photo: both drawn on Home's foot and header.
  const face = await admin.storage // storage-boundary: allow
    .from('avatars')
    .upload(user, await webp(256, 256, 90), { contentType: 'image/webp' });
  if (face.error) throw face.error;
  await admin.from('profiles').update({ avatar_path: user, avatar_version: 1 }).eq('id', user);

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
    p_name: 'Once',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Walks', icon: '🚶', my_category_id: null }],
    p_include_history: false,
  });
  if (created.error) throw created.error;
  pool = created.data!;
  const tile = await admin.storage // storage-boundary: allow
    .from('pool-photos')
    .upload(pool, await webp(256, 256, 220), { contentType: 'image/webp' });
  if (tile.error) throw tile.error;
  await admin.from('pools').update({ photo_path: pool, photo_version: 1 }).eq('id', pool);
});

test.afterAll(async () => {
  if (user) {
    const { data } = await admin.storage.from('ripple-media').list(user); // storage-boundary: allow
    const stored = (data ?? []).map((o) => `${user}/${o.name}`);
    if (stored.length) await admin.storage.from('ripple-media').remove(stored); // storage-boundary: allow
  }
  if (splash) await admin.from('splashes').delete().eq('id', splash);
  if (pool) {
    await admin.storage.from('pool-photos').remove([pool]); // storage-boundary: allow
    await admin.from('pools').delete().eq('id', pool);
  }
  if (user) await admin.storage.from('avatars').remove([user]); // storage-boundary: allow
  if (user) await admin.auth.admin.deleteUser(user);
});

/** Every image in `selector` drawn. */
async function loaded(page: Page, selector: string, count: number): Promise<void> {
  await expect(page.locator(selector)).toHaveCount(count, { timeout: 30_000 });
  await page.waitForFunction(
    (selector) =>
      [...document.querySelectorAll<HTMLImageElement>(selector)].every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    selector,
    { timeout: 30_000 },
  );
}

test('each photo copy is fetched once, by one URL, across reloads and the page', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one browser run is enough');
  test.setTimeout(120_000);
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page.context().addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL! }]);

  // What the network was asked for, per object: the URLs, and the fetches
  // the browser's cache did not answer.
  const urls = new Map<string, Set<string>>();
  const fetched = new Map<string, number>();
  // Bucket and object: a photo's copies, a face, a pool's photo.
  const objectOf = (url: string) => {
    const match = new URL(url).pathname.match(
      /\/storage\/v1\/object\/sign\/(ripple-media|avatars|pool-photos)\/(.+)$/,
    );
    return match ? `${match[1]}/${decodeURIComponent(match[2])}` : null;
  };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const sent = new Map<string, string>();
  cdp.on('Network.requestWillBeSent', ({ requestId, request }) => {
    const object = objectOf(request.url);
    if (!object) return;
    sent.set(requestId, object);
    urls.set(object, (urls.get(object) ?? new Set()).add(request.url));
  });
  cdp.on('Network.responseReceived', ({ requestId, response }) => {
    const object = sent.get(requestId);
    if (!object || response.fromDiskCache || response.fromServiceWorker) return;
    fetched.set(object, (fetched.get(object) ?? 0) + 1);
  });
  cdp.on('Network.requestServedFromCache', ({ requestId }) => {
    const object = sent.get(requestId);
    if (object) fetched.set(object, (fetched.get(object) ?? 1) - 1);
  });

  const card = '[data-card-photo] img';
  const onPage = 'img[data-photo]';
  await page.goto('/');
  await loaded(page, card, 2);
  // The face and the pool's photo, drawn by Home's foot and header.
  await page.waitForFunction(
    () =>
      ['img[data-avatar-photo]', 'img[data-pool-photo]'].every((selector) =>
        [...document.querySelectorAll<HTMLImageElement>(selector)].some(
          (img) => img.complete && img.naturalWidth > 0,
        ),
      ),
    null,
    { timeout: 30_000 },
  );
  await page.reload();
  await loaded(page, card, 2);
  await page.goto(splashPath(splash));
  await loaded(page, onPage, 2);
  await page.goBack();
  await loaded(page, card, 2);
  await page.reload();
  await loaded(page, card, 2);

  const thumbs = paths.map((p) => `ripple-media/${p.replace(/\.webp$/, '.t.webp')}`);
  const displays = paths.map((p) => `ripple-media/${p.replace(/\.webp$/, '.d.webp')}`);
  // Cards load the thumbnail, the page the display copy, nothing the full
  // photo; the face and the pool's photo load too.
  expect([...urls.keys()].sort()).toEqual(
    [...thumbs, ...displays, `avatars/${user}`, `pool-photos/${pool}`].sort(),
  );
  for (const object of urls.keys()) {
    expect(urls.get(object)!.size, `one URL for ${object.slice(-12)}`).toBe(1);
    expect(fetched.get(object) ?? 0, `fetched once: ${object.slice(-12)}`).toBeLessThanOrEqual(1);
  }
});
