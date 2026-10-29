import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { config } from 'dotenv';
import { expect, test, type CDPSession, type Page } from '@playwright/test';

import { asAdmin, asUser } from '../tests/as-user';
import { MEDIA_BUCKET } from '@/lib/media-bucket';
import type { ThemeColor, ThemeMode } from '@/lib/theme';
import { todayIn } from '@/lib/time';

config({ path: '.env.local', quiet: true });

/**
 * Switching pools as fast as a thumb can (2026-10-29: a white screen that
 * took no scroll and no tap, with nothing in Sentry). Four pools, each in
 * its own colour and mode, each with records that carry a photo and a
 * title long enough to wrap — what the board measures — tapped one after
 * another with no wait for 30s, at full speed and at a quarter; then the
 * page must still answer and still draw a place.
 *
 * It was never a loop: the page answered throughout. A place's segment
 * whose data was cut off by the next tap settled to "missing", and the
 * router reused it from its caches with no request, so the page under the
 * shell rendered nothing — strip included — until a reload. Fixed by not
 * prefetching at the press (GroundFoot) and by a patch to Next's BFCache
 * (patches/next@16.3.5.patch). A throwaway person, removed after.
 */
const admin = asAdmin();
test.describe.configure({ mode: 'serial' });
test.use({ hasTouch: true });
const TZ = 'America/Vancouver';
const PHOTO = readFileSync('public/icon-512.png');
const WIDE = widePng(300, 100);
const POOLS: { name: string; color: ThemeColor; mode: ThemeMode }[] = [
  { name: 'Swims', color: 'pink', mode: 'light' },
  { name: 'Trips', color: 'sky', mode: 'dark' },
  { name: 'Books', color: 'blue', mode: 'pastel' },
  { name: 'Walks', color: 'pink', mode: 'dark' },
];
const SECONDS = 30;

/** A flat 3:1 PNG: a photo whose ratio is not the square's. */
function widePng(w: number, h: number): Buffer {
  const crc = (b: Buffer): number => {
    let c = ~0;
    for (const byte of b) {
      c ^= byte;
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let me = '';
let cookie = '';
const pools: string[] = [];
const objects: string[] = [];

async function record(pool: string, poolLane: string, lane: string, title: string, photo: Buffer) {
  const path = `${me}/${crypto.randomUUID()}.png`;
  const stored = await admin.storage
    .from(MEDIA_BUCKET)
    .upload(path, photo, { contentType: 'image/png' });
  if (stored.error) throw stored.error;
  objects.push(path);
  const id = crypto.randomUUID();
  const made = await asUser(me)
    .from('splashes')
    .insert({ id, owner_id: me, title, declared_start: todayIn(TZ), declared_lane_id: lane });
  if (made.error) throw made.error;
  const ripple = await asUser(me)
    .from('ripples')
    .insert({ author_id: me, media: [path], note: 'A note', splash_id: id });
  if (ripple.error) throw ripple.error;
  const placed = await asUser(me)
    .from('splash_placements')
    .insert({ splash_id: id, pool_id: pool, pool_lane_id: poolLane });
  if (placed.error) throw placed.error;
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const email = `fast-switch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  me = made.data.user.id;
  await admin.from('profiles').insert({ id: me, display_name: 'Quick', timezone: TZ });
  const lane = (
    await admin
      .from('my_categories')
      .insert({ user_id: me, name: 'Day', icon: '🌊' })
      .select('id')
      .single()
  ).data!.id;
  for (const [i, p] of POOLS.entries()) {
    const created = await asUser(me).rpc('create_pool', {
      p_name: p.name,
      p_kind: null as unknown as 'friends',
      p_lanes: [{ name: p.name, icon: '🏕', my_category_id: null }],
      p_include_history: false,
    });
    if (created.error) throw created.error;
    const pool = created.data!;
    pools.push(pool);
    await asUser(me)
      .from('member_pool_settings')
      .upsert({ pool_id: pool, user_id: me, theme: p.color, theme_mode: p.mode });
    const poolLane = (await asUser(me).from('pool_lanes').select('id').eq('pool_id', pool).single())
      .data!.id;
    await record(pool, poolLane, lane, `A title long enough to wrap on the board ${i}`, PHOTO);
    await record(pool, poolLane, lane, `Short ${i}`, WIDE);
  }

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
  if (objects.length > 0) await admin.storage.from(MEDIA_BUCKET).remove(objects);
  if (me) await admin.from('ripples').delete().eq('author_id', me);
  if (pools.length > 0) await admin.from('pools').delete().in('id', pools);
  if (me) {
    await admin.from('splashes').delete().eq('owner_id', me);
    await admin.auth.admin.deleteUser(me);
  }
});

/** Resolves false when the page's main thread does not answer within `ms`. */
async function answers(page: Page, ms: number): Promise<boolean> {
  return Promise.race([
    page.evaluate(() => true).catch(() => false),
    new Promise<boolean>((r) => setTimeout(() => r(false), ms)),
  ]);
}

/** Where a stuck thread is: paused through the debugger, its stack read back. */
async function stuckStack(cdp: CDPSession): Promise<string> {
  const paused = new Promise<string>((resolve) => {
    cdp.once('Debugger.paused', (e) =>
      resolve(
        e.callFrames
          .slice(0, 25)
          .map(
            (f) =>
              `${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.location.lineNumber + 1}:${(f.location.columnNumber ?? 0) + 1}`,
          )
          .join('\n'),
      ),
    );
  });
  await cdp.send('Debugger.pause');
  return Promise.race([
    paused,
    new Promise<string>((r) => setTimeout(() => r('(no pause: not in script)'), 5_000)),
  ]);
}

/**
 * A blank place, explained: each layout router under the shell, its segment
 * and what its cache node holds. The white screen was a segment holding a
 * promise settled to null, its children never rendered.
 */
async function blankReport(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type Fiber = {
      type: unknown;
      child: Fiber | null;
      sibling: Fiber | null;
      memoizedProps: Record<string, unknown> | null;
    };
    const slot = document.body.firstElementChild?.firstElementChild;
    const key = slot && Object.keys(slot).find((k) => k.startsWith('__reactFiber$'));
    if (!slot || !key) return [`no slot at ${location.pathname}`];
    const show = (v: unknown): string => {
      if (v === null || typeof v !== 'object') return String(v);
      const o = v as { status?: string; value?: unknown; $$typeof?: unknown };
      if (o.$$typeof) return 'element';
      if (o.status) return `thenable ${o.status} → ${o.value === null ? 'null' : typeof o.value}`;
      return 'object';
    };
    const out = [`at ${location.pathname}`];
    const walk = (f: Fiber | null): void => {
      for (; f; f = f.sibling) {
        if ((f.type as { name?: string } | null)?.name === 'InnerLayoutRouter') {
          const p = f.memoizedProps as { segmentPath?: unknown; cacheNode?: { rsc?: unknown } };
          out.push(`${JSON.stringify(p.segmentPath)}: ${show(p.cacheNode?.rsc)}`);
        }
        walk(f.child);
      }
    };
    walk((slot as unknown as Record<string, Fiber>)[key]);
    return out;
  });
}

async function signIn(page: Page, baseURL: string): Promise<void> {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page.context().addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL }]);
}

for (const rate of [1, 4]) {
  test(`switching pools as fast as possible for ${SECONDS}s leaves a page that answers and draws (CPU ×${rate})`, async ({
    page,
    baseURL,
  }) => {
    test.setTimeout((SECONDS + 120) * 1_000);
    await signIn(page, baseURL!);
    await page.goto('/');
    const strip = (id: string) => page.locator(`[data-strip-pool="${id}"]:visible`).first();
    await expect(strip(pools[0])).toBeVisible({ timeout: 60_000 });

    // The strip's places, measured once: taps then go to the screen, never
    // waiting on the page to say a link is ready.
    await page.waitForLoadState('networkidle');
    const at = await page.evaluate((ids) => {
      const visible = (id: string) =>
        [...document.querySelectorAll(`[data-strip-pool="${id}"]`)].find(
          (el) => el.getBoundingClientRect().width > 0,
        )!;
      return ids.map((id) => {
        visible(id).scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const r = visible(id).getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
    }, pools);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Debugger.enable');
    if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });

    let taps = 0;
    let hung = false;
    const end = Date.now() + SECONDS * 1_000;
    while (Date.now() < end && !hung) {
      const p = at[taps % at.length];
      // A tap the renderer does not take within 3s may be a thread that is stuck.
      const took = await Promise.race([
        page.touchscreen
          .tap(p.x, p.y)
          .then(() => true)
          .catch(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 3_000)),
      ]);
      taps += 1;
      if (!took && !(await answers(page, 2_000))) hung = true;
    }
    if (!hung && !(await answers(page, 5_000))) hung = true;
    expect(hung, hung ? `stuck after ${taps} taps:\n${await stuckStack(cdp)}` : '').toBe(false);

    if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    // A place is drawn, and the strip still takes a tap.
    const drawn = await page
      .locator('[data-pool-ground]:visible')
      .first()
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (!drawn) await page.screenshot({ path: test.info().outputPath('blank.png') });
    expect(drawn, drawn ? '' : (await blankReport(page)).join('\n')).toBe(true);
    await strip(pools[0]).click({ timeout: 10_000 });
    await expect(page.locator(`[data-pool-ground="${pools[0]}"]`)).toBeVisible({
      timeout: 30_000,
    });
  });
}

test('a blank page, forced, is reported, refreshed, and never left white', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(270_000);
  // The bug back on purpose: Next as it ships (the patch's test-only flag),
  // and a full prefetch at every press on the strip, as the strip did.
  await page.addInitScript(() => {
    (globalThis as { __nextBfcacheKeepMissing?: boolean }).__nextBfcacheKeepMissing = true;
    document.addEventListener(
      'pointerdown',
      (e) => {
        const link = (e.target as Element).closest('a[data-strip-pool]');
        const router = (
          window as { next?: { router?: { prefetch: (h: string, o: object) => void } } }
        ).next?.router;
        if (link && router) router.prefetch(link.getAttribute('href')!, { kind: 'full' });
      },
      true,
    );
  });
  const reports: string[] = [];
  page.on('console', (m) => {
    if (m.text().startsWith('[watchdog] Page')) reports.push(m.text());
  });
  await signIn(page, baseURL!);
  await page.goto('/');
  await expect(page.locator(`[data-strip-pool="${pools[0]}"]:visible`).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForLoadState('networkidle');
  const at = await page.evaluate((ids) => {
    const visible = (id: string) =>
      [...document.querySelectorAll(`[data-strip-pool="${id}"]`)].find(
        (el) => el.getBoundingClientRect().width > 0,
      )!;
    return ids.map((id) => {
      const r = visible(id).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
  }, pools);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // Switch until the page goes blank and is reported (the strip goes with it).
  const end = Date.now() + 150_000;
  for (let taps = 0; reports.length === 0 && Date.now() < end; taps += 1) {
    const p = at[taps % at.length];
    await page.touchscreen.tap(p.x, p.y).catch(() => {});
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  expect(reports[0], 'no blank page could be forced').toMatch(
    /^\[watchdog\] Page rendered nothing for 3s at \/pool\/\[id\] \(refresh\)$/,
  );

  // Recovered by the refresh, or Reload offered: never left white.
  const ground = page.locator('[data-pool-ground]:visible').first();
  const lost = page.locator('[data-page-lost]');
  await expect(ground.or(lost)).toBeVisible({ timeout: 20_000 });
  if (await lost.isVisible()) {
    expect(reports[1]).toMatch(
      /^\[watchdog\] Page still rendered nothing after a refresh, \d+s at \/pool\/\[id\] \(reload\)$/,
    );
    await lost.getByRole('button', { name: 'Reload' }).click();
    await expect(ground).toBeVisible({ timeout: 60_000 });
    test.info().annotations.push({ type: 'recovery', description: 'reload' });
  } else {
    test.info().annotations.push({ type: 'recovery', description: 'refresh' });
  }
  console.log('recovered by', test.info().annotations.at(-1)!.description);
});

test('a main thread stuck for seven seconds is reported by the watchdog’s worker', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await signIn(page, baseURL!);
  await page.goto('/');
  await expect(page.locator(`[data-strip-pool="${pools[0]}"]:visible`).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.locator(`[data-strip-pool="${pools[0]}"]:visible`).first().click();
  await expect(page.locator(`[data-pool-ground="${pools[0]}"]`)).toBeVisible({ timeout: 60_000 });
  // A local build sends nothing to Sentry; its worker says so in the console.
  const reported = page.waitForEvent('console', {
    predicate: (m) => m.text().startsWith('[watchdog]'),
    timeout: 30_000,
  });
  await page.evaluate(() => {
    const until = Date.now() + 7_000;
    while (Date.now() < until) {
      // The loop the watchdog is for.
    }
  });
  // The route as a pattern: never the pool's id.
  expect((await reported).text()).toMatch(
    /^\[watchdog\] Main thread stalled for \d+s at \/pool\/\[id\]$/,
  );
});
