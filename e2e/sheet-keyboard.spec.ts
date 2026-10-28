import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';

import { asAdmin } from '../tests/as-user';

config({ path: '.env.local', quiet: true });

/**
 * The compose sheet never covers the whole screen (review): its top stays
 * at least 56px down, over the dimmed board, and Drop stays in reach in a
 * footer pinned to its bottom — with the content taller than the room, and
 * with the keyboard up, simulated by a visual viewport 340px shorter. One
 * throwaway person against the local stack, removed after.
 */
const admin = asAdmin();
const KEYBOARD_PX = 340;
const TOP_GAP_PX = 56;

let me = '';
let cookie = '';

test.beforeAll(async () => {
  const email = `sheet-keyboard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  me = made.data.user.id;
  await admin
    .from('profiles')
    .insert({ id: me, display_name: 'Kay', timezone: 'America/Vancouver' });
  await admin.from('my_categories').insert({ user_id: me, name: 'Day', icon: '🌊' });

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
  cookie = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
});

test.afterAll(async () => {
  if (me) await admin.auth.admin.deleteUser(me);
});

/** A visual viewport whose height the test sets, as a keyboard would. */
async function fakeKeyboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const real = window.visualViewport!;
    const fake = new EventTarget();
    let keyboard = 0;
    for (const key of ['width', 'offsetLeft', 'pageLeft', 'pageTop', 'scale'] as const) {
      Object.defineProperty(fake, key, { get: () => real[key] });
    }
    Object.defineProperty(fake, 'height', { get: () => window.innerHeight - keyboard });
    Object.defineProperty(fake, 'offsetTop', { get: () => 0 });
    Object.defineProperty(window, 'visualViewport', { value: fake });
    (window as unknown as { __keyboard: (px: number) => void }).__keyboard = (px) => {
      keyboard = px;
      fake.dispatchEvent(new Event('resize'));
    };
  });
}

/** The sheet's top, and Drop's box, against the room the keyboard leaves. */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('[data-splash-sheet]')!.getBoundingClientRect();
    const drop = [...document.querySelectorAll('[data-splash-sheet] button')]
      .find((b) => b.textContent?.trim() === 'Drop')!
      .getBoundingClientRect();
    return {
      top: sheet.top,
      bottom: sheet.bottom,
      dropTop: drop.top,
      dropBottom: drop.bottom,
      room: window.visualViewport!.height,
    };
  });
}

test('the compose sheet keeps 56px of the board above it and Drop in reach, keyboard up', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'phone', 'a phone’s keyboard');
  test.setTimeout(120_000);
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page.context().addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL! }]);
  await fakeKeyboard(page);
  await page.goto('/');
  const compose = page.locator('[data-compose]:visible').first();
  await expect(compose).toBeVisible({ timeout: 90_000 });
  const sheet = page.locator('[data-splash-sheet]');
  // Tapped again until the page has hydrated and the sheet answers.
  await expect(async () => {
    await compose.click();
    await expect(sheet).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });

  // Content far taller than the screen: the sheet stops short of the top.
  const body = sheet.getByLabel('Content');
  await body.fill(Array.from({ length: 60 }, (_, n) => `Line ${n + 1}`).join('\n'));
  await page.waitForTimeout(400); // the rise
  let at = await geometry(page);
  expect(at.top).toBeGreaterThanOrEqual(TOP_GAP_PX);
  expect(at.dropTop).toBeGreaterThanOrEqual(at.top);
  expect(at.dropBottom).toBeLessThanOrEqual(at.room);

  // The keyboard rises: the sheet shrinks with the room, its top stays put
  // below the gap, and Drop sits above the keyboard.
  await body.focus();
  await page.evaluate(
    (px) => (window as unknown as { __keyboard: (px: number) => void }).__keyboard(px),
    KEYBOARD_PX,
  );
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  at = await geometry(page);
  expect(at.room).toBe(844 - KEYBOARD_PX);
  expect(at.top).toBeGreaterThanOrEqual(TOP_GAP_PX);
  expect(at.bottom).toBeLessThanOrEqual(at.room + 0.5);
  expect(at.dropTop).toBeGreaterThanOrEqual(at.top);
  expect(at.dropBottom).toBeLessThanOrEqual(at.room);
  await expect(sheet.getByRole('button', { name: 'Drop', exact: true })).toBeInViewport();

  // The board above it is still there to tap, and closes the sheet.
  await page.mouse.click(195, TOP_GAP_PX / 2);
  await expect(sheet).toHaveCount(0);
});
