import { config } from 'dotenv';
import { expect, test, type Page } from '@playwright/test';

import { asAdmin } from '../tests/as-user';

config({ path: '.env.local', quiet: true });

/**
 * Reordering lanes by the grip (H42b), in a real browser: the dragged row
 * stays under the finger the whole way, every row it passes steps aside,
 * and the order it is let go in is the one saved — no Save button, a toast
 * once it has. One throwaway person with four lanes against the local
 * stack, removed after.
 */
const admin = asAdmin();
const LANES = ['Alpha', 'Beta', 'Gamma', 'Delta'];

let me = '';
let cookie = '';

test.beforeAll(async () => {
  const email = `lane-reorder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@during.today`;
  const made = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (made.error) throw made.error;
  me = made.data.user.id;
  await admin
    .from('profiles')
    .insert({ id: me, display_name: 'Kay', timezone: 'America/Vancouver' });
  const lanes = await admin
    .from('my_categories')
    .insert(LANES.map((name, position) => ({ user_id: me, name, icon: '🌊', position })));
  if (lanes.error) throw lanes.error;

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

/** The rows' names, top to bottom, as the editor shows them. */
function shown(page: Page): Promise<string[]> {
  return page
    .locator('[data-lane-row] input[aria-label="Lane name"]')
    .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value));
}

/** The vertical middle of a row, on screen. */
async function middleOf(page: Page, name: string): Promise<number> {
  const box = await page
    .locator('[data-lane-row]', { has: page.locator(`input[value="${name}"]`) })
    .boundingBox();
  return box!.y + box!.height / 2;
}

async function saved(): Promise<string[]> {
  const { data } = await admin
    .from('my_categories')
    .select('name')
    .eq('user_id', me)
    .order('position');
  return (data ?? []).map((row) => row.name);
}

test('a lane dragged by its grip follows the finger and lands where it is let go', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'phone', 'one drag is enough');
  test.setTimeout(120_000);
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page.context().addCookies([{ name: `sb-${ref}-auth-token`, value: cookie, url: baseURL! }]);
  await page.goto('/?settings=home');
  const editor = page.locator('[data-lanes-editor]');
  await expect(editor).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => shown(page), { timeout: 30_000 }).toEqual(LANES);

  // Alpha, by its grip, down past Beta and Gamma, in small steps as a finger moves.
  const grip = page.getByRole('button', { name: 'Move Alpha' });
  // The sheet has risen and stopped: the grip is where it will stay.
  let last = -1;
  await expect(async () => {
    const box = (await grip.boundingBox())!;
    const settled = box.y === last;
    last = box.y;
    await page.waitForTimeout(150);
    expect(settled).toBe(true);
  }).toPass({ timeout: 10_000 });
  const start = (await grip.boundingBox())!;
  const x = start.x + start.width / 2;
  const y0 = start.y + start.height / 2;
  const target = await middleOf(page, 'Gamma');
  const end = target + 12;
  await page.mouse.move(x, y0);
  await page.mouse.down();
  const STEPS = 24;
  for (let step = 1; step <= STEPS; step++) {
    const y = y0 + ((end - y0) * step) / STEPS;
    await page.mouse.move(x, y);
    // Under the finger the whole way: the row's middle tracks the pointer.
    await expect.poll(() => middleOf(page, 'Alpha'), { timeout: 2_000 }).toBeGreaterThan(y - 8);
    expect(await middleOf(page, 'Alpha')).toBeLessThan(y + 8);
  }
  // Still held: the rows it passed have stepped aside.
  expect(await shown(page)).toEqual(['Beta', 'Gamma', 'Alpha', 'Delta']);
  await page.mouse.up();

  // Let go: it settles in its slot, is saved without a Save, and says so.
  await expect.poll(() => shown(page)).toEqual(['Beta', 'Gamma', 'Alpha', 'Delta']);
  await expect(page.locator('[data-lanes-save]')).toHaveCount(0);
  await expect.poll(saved, { timeout: 15_000 }).toEqual(['Beta', 'Gamma', 'Alpha', 'Delta']);
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
});
