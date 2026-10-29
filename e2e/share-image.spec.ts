import { readFileSync, writeFileSync } from 'node:fs';
import { config } from 'dotenv';
import { expect, test } from '@playwright/test';

import { asAdmin, asUser } from '../tests/as-user';
import { MEDIA_BUCKET } from '@/lib/media-bucket';
import { poolPath } from '@/lib/routes';
import { todayIn } from '@/lib/time';

config({ path: '.env.local', quiet: true });

/**
 * Share as image (H63), in Chrome: the PNG is made in the browser, 1080×1920,
 * on the pool's own ground (pink here, Home blue), and opening it requests
 * no photo of anyone else's. Tea and Mina are throwaway people in a pool,
 * each with a record and a photo on today; removed after.
 */
const admin = asAdmin();
// One world, its theme changed by the second test: in order.
test.describe.configure({ mode: 'serial' });
const people: string[] = [];
const objects: string[] = [];
let pool = '';
let cookie = '';
let minaPath = '';
const TZ = 'America/Vancouver';
const PHOTO = readFileSync('public/icon-512.png');
const TEA_VIDEO = 'jNQXAC9IVRw';
const MINA_VIDEO = 'SENTINEL123';

async function person(name: string): Promise<{ id: string; email: string }> {
  const email = `share-image-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  const id = made.data.user.id;
  people.push(id);
  await admin.from('profiles').insert({ id, display_name: name, timezone: TZ });
  await admin.from('my_categories').insert({ user_id: id, name: 'Day', icon: '🌊' });
  return { id, email };
}

async function record(
  who: string,
  title: string,
  poolLane: string,
  note: string | null = null,
): Promise<string> {
  const path = `${who}/${crypto.randomUUID()}.png`;
  const stored = await admin.storage
    .from(MEDIA_BUCKET)
    .upload(path, PHOTO, { contentType: 'image/png' });
  if (stored.error) throw stored.error;
  objects.push(path);
  const lane = (await admin.from('my_categories').select('id').eq('user_id', who).single()).data!
    .id;
  const id = crypto.randomUUID();
  const made = await asUser(who)
    .from('splashes')
    .insert({
      id,
      owner_id: who,
      title,
      declared_start: todayIn(TZ),
      declared_lane_id: lane,
    });
  if (made.error) throw made.error;
  const ripple = await asUser(who)
    .from('ripples')
    .insert({ author_id: who, media: [path], note, splash_id: id });
  if (ripple.error) throw ripple.error;
  const placed = await asUser(who)
    .from('splash_placements')
    .insert({ splash_id: id, pool_id: pool, pool_lane_id: poolLane });
  if (placed.error) throw placed.error;
  return path;
}

test.beforeAll(async () => {
  const tea = await person('Tea');
  const mina = await person('Mina');
  await admin
    .from('my_theme_settings')
    .upsert({ user_id: tea.id, home_color: 'blue', mode: 'dark', apply_everywhere: false });
  const made = await asUser(tea.id).rpc('create_pool', {
    p_name: 'SENTINEL-POOL',
    p_kind: null as unknown as 'friends',
    p_lanes: [{ name: 'Trips', icon: '🏕', my_category_id: null }],
    p_include_history: false,
  });
  if (made.error) throw made.error;
  pool = made.data!;
  const token = (await asUser(tea.id).rpc('create_invite', { p_pool: pool })).data![0].token;
  const joined = await asUser(mina.id).rpc('join_pool', {
    p_token: token,
    p_links: [],
    p_include_history: false,
  });
  if (joined.error) throw joined.error;
  await asUser(tea.id)
    .from('member_pool_settings')
    .upsert({ pool_id: pool, user_id: tea.id, theme: 'pink', theme_mode: 'dark' });
  const poolLane = (
    await asUser(tea.id).from('pool_lanes').select('id').eq('pool_id', pool).single()
  ).data!.id;
  // A video each: Tea's thumbnail is fetched by the server; Mina's never.
  await record(tea.id, 'Swim today', poolLane, `Song https://youtu.be/${TEA_VIDEO}`);
  minaPath = await record(mina.id, 'SENTINEL-MINA', poolLane, `https://youtu.be/${MINA_VIDEO}`);

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: tea.email });
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
  if (objects.length > 0) await admin.storage.from(MEDIA_BUCKET).remove(objects);
  await admin.from('ripples').delete().in('author_id', people);
  if (pool) await admin.from('pools').delete().eq('id', pool);
  for (const id of people) {
    await admin.from('splashes').delete().eq('owner_id', id);
    await admin.auth.admin.deleteUser(id);
  }
});

test('a pool’s Calendar shares as a 1080×1920 PNG on its own ground, with no one else’s photo fetched', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'phone', 'one width is enough');
  test.setTimeout(180_000);
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page.context().addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL! }]);
  // The share sheet, stubbed: what it was handed is kept.
  await page.addInitScript(() => {
    const w = window as unknown as { shared: { type: string; name: string; size: number }[] };
    w.shared = [];
    Object.assign(navigator, {
      canShare: () => true,
      share: async ({ files }: { files: File[] }) => {
        w.shared.push(...files.map((f) => ({ type: f.type, name: f.name, size: f.size })));
      },
    });
  });
  await page.goto(poolPath(pool));
  const glyph = page.locator('[data-board-share]');
  await expect(glyph).toBeVisible({ timeout: 60_000 });
  // The board shows Mina's record and may sign her photo; the export must not.
  await expect(page.locator('[data-month-board]')).toContainText('Swim today', { timeout: 30_000 });
  // Every image on the board settled first — both photos and the videos' thumbnails,
  // which the board loads itself — so anything fetched after is the export's.
  await expect
    .poll(
      () =>
        page
          .locator('[data-month-board] img')
          .evaluateAll((imgs) =>
            imgs.length >= 2 && imgs.every((img) => (img as HTMLImageElement).complete)
              ? imgs.length
              : 0,
          ),
      { timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(2);

  // A mid phone, roughly: the CPU slowed four times.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const fetched: string[] = [];
  // What the page asks for itself: the export inlines with fetch() and draws only data
  // URLs, while the board behind the sheet may still be loading its own <img>s.
  page.on('request', (request) => {
    if (request.resourceType() !== 'image') fetched.push(request.url());
  });
  const started = Date.now();
  await glyph.click();
  await expect(page.locator('[data-share-preview="ready"]')).toBeVisible({ timeout: 60_000 });
  const took = Date.now() - started;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // The stage never held her words; no request named her photo.
  const stage = await page.locator('[data-share-stage]').innerHTML();
  expect(stage).not.toContain('SENTINEL');
  expect(stage).toContain('Swim today');
  expect(fetched.filter((url) => url.includes(MINA_VIDEO))).toEqual([]);
  // Tea's video: its thumbnail inlined by the server, or the plain tile when YouTube
  // could not be reached; either way with its play mark, and never fetched by the page.
  const tile = page.locator(`[data-share-stage] [data-board-photo-card="yt:${TEA_VIDEO}"]`);
  await expect(tile.locator('[data-video-thumb] svg')).toHaveCount(1);
  const thumb = await tile
    .locator('img')
    .getAttribute('src')
    .catch(() => null);
  console.log(
    `[share-image] video: ${thumb?.startsWith('data:image/') ? 'thumbnail' : 'plain tile'}`,
  );
  if (thumb !== null) expect(thumb.startsWith('data:image/')).toBe(true);
  expect(fetched.filter((url) => url.includes('ytimg.com'))).toEqual([]);
  // And the page itself asks for no image: every one on it is already inlined.
  const srcs = await page
    .locator('[data-share-stage] img')
    .evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).src.slice(0, 11)));
  expect(srcs.length).toBeGreaterThan(0);
  for (const src of srcs) expect(src).toBe('data:image/');
  expect(fetched.filter((url) => url.includes(minaPath))).toEqual([]);

  const png = await page
    .locator('[data-share-preview] img')
    .evaluate(async (img: HTMLImageElement) => {
      const blob = await (await fetch(img.src)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      return {
        width: bitmap.width,
        height: bitmap.height,
        bytes: blob.size,
        type: blob.type,
        corner: [...ctx.getImageData(4, 4, 1, 1).data],
      };
    });
  console.log(`[share-image] ${png.bytes} bytes, drawn in ${took}ms at 4x CPU throttling`);
  expect(png.type).toBe('image/png');
  expect([png.width, png.height]).toEqual([1080, 1920]);
  // Pink's ground (#E5318C), opaque: the pool's colour, not Home's blue.
  expect(png.corner).toEqual([0xe5, 0x31, 0x8c, 255]);

  // Kept beside the run, to look at: this week, then this month.
  const save = async (name: string): Promise<void> => {
    const b64 = await page
      .locator('[data-share-preview] img')
      .evaluate(async (img: HTMLImageElement) => {
        const bytes = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
        let out = '';
        for (const byte of bytes) out += String.fromCharCode(byte);
        return btoa(out);
      });
    writeFileSync(info.outputPath(name), Buffer.from(b64, 'base64'));
  };
  await save('week.png');

  await page.locator('[data-share-go]').click();
  const shared = await page.evaluate(
    () => (window as unknown as { shared: { type: string; name: string; size: number }[] }).shared,
  );
  expect(shared).toHaveLength(1);
  expect(shared[0]).toMatchObject({ type: 'image/png', size: png.bytes });
  expect(shared[0].name).toMatch(/^weming-(week|month)-\d{4}-\d{2}-\d{2}\.png$/);

  await page.locator('[data-share-span="month"]').click();
  await expect(page.locator('[data-share-preview="ready"]')).toBeVisible({ timeout: 60_000 });
  expect(await page.locator('[data-share-stage]').innerHTML()).not.toContain('SENTINEL');
  await save('month.png');
});

test('in light mode the image is the white ground with the pool’s colour on it', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'phone', 'one width is enough');
  test.setTimeout(120_000);
  const me = people[0];
  await asUser(me)
    .from('member_pool_settings')
    .upsert({ pool_id: pool, user_id: me, theme: 'pink', theme_mode: 'light' });
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page.context().addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL! }]);
  await page.goto(poolPath(pool));
  await page.locator('[data-board-share]').click({ timeout: 60_000 });
  await expect(page.locator('[data-share-preview="ready"]')).toBeVisible({ timeout: 60_000 });
  const seen = await page
    .locator('[data-share-preview] img')
    .evaluate(async (img: HTMLImageElement) => {
      const bitmap = await createImageBitmap(await (await fetch(img.src)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      // Pink's own pixels: the title, the numbers, the rules.
      let pink = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 0xe5 && data[i + 1] === 0x31 && data[i + 2] === 0x8c) pink += 1;
      }
      return { corner: [...data.slice(0, 4)], pink };
    });
  expect(seen.corner).toEqual([255, 255, 255, 255]);
  expect(seen.pink).toBeGreaterThan(1000);
});
