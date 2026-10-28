import { expect, test, type Locator, type Page } from '@playwright/test';

import { activate as activatePiece } from './measure';

/**
 * The toolbar (review; H41), one structure on every width: the parts as
 * tabs with More at the right; the selected part's own controls — All's,
 * the four layer buttons; a part's, after which a desktop adds the layers
 * (the label's go to the last row) — and Undo at the left, Done at the
 * right. On a phone it is docked to the foot of the screen, full width,
 * the selected piece scrolled above it. With a post of every part active
 * on /dev/board?scene=toolbar, every control is wholly on screen, 44px tall
 * on a phone and 36px on a desktop; no wave tab or wave anywhere.
 */
const NAMES = [
  'data-edit-eye',
  'data-edit-text-smaller',
  'data-edit-text-larger',
  'data-edit-style',
  'data-edit-icon-inline',
  'data-edit-layer',
  'data-edit-undo',
  'data-edit-more',
  'data-edit-done',
];
const named = (bar: Locator, selector: string) =>
  bar
    .locator(`${selector} button`)
    .evaluateAll(
      (buttons, names) => buttons.map((b) => names.find((a) => b.hasAttribute(a)) ?? '?'),
      NAMES,
    );

async function activate(page: Page, id: string): Promise<Locator> {
  // Next's dev tools button sits in the corner a phone's docked Undo takes;
  // production has none.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  return activatePiece(page, id);
}

test('every toolbar control is on screen and in its row; All, tabs and the dock work', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone' && info.project.name !== 'desktop');
  const phone = info.project.name === 'phone';
  const tall = phone ? 44 : 36;
  await page.goto('/dev/board?scene=toolbar');
  const bar = await activate(page, 'full');
  await expect(bar.locator('[data-edit-part-chip]')).toHaveText([
    'All',
    'Label',
    'Icon',
    'Photo 1',
    'Photo 2',
    'Photo 3',
  ]);
  // No wave: a stored one is drawn nowhere.
  await expect(page.locator('[data-board-wave]')).toHaveCount(0);

  // Three rows: the tabs and More, the part's own, Undo to Done.
  const rows = await bar.evaluate((el) =>
    [...el.children].map((row) =>
      row.hasAttribute('data-edit-tab-row')
        ? 'tabs'
        : row.hasAttribute('data-edit-part-row')
          ? 'part'
          : row.hasAttribute('data-edit-actions')
            ? 'actions'
            : '?',
    ),
  );
  expect(rows).toEqual(['tabs', 'part', 'actions']);
  expect(await named(bar, '[data-edit-tab-row] > ')).toEqual(['data-edit-more']);
  const tabRow = (await bar.locator('[data-edit-tab-row]').boundingBox())!;
  const more = (await bar.locator('[data-edit-more]').boundingBox())!;
  expect(more.x + more.width).toBeCloseTo(tabRow.x + tabRow.width, 0);

  // All, selected as it became active: its row is the four layer buttons.
  await expect(bar.locator('[data-edit-part-chip="All"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-edit-frame="piece"]')).toBeVisible();
  expect(await named(bar, '[data-edit-part-row]')).toEqual(Array(4).fill('data-edit-layer'));
  expect(await named(bar, '[data-edit-actions]')).toEqual(['data-edit-undo', 'data-edit-done']);

  const viewport = page.viewportSize()!;
  const board = (await page.locator('[data-board-scroller]').boundingBox())!;
  // A phone's bar is the screen's; a desktop's keeps within the board.
  const left = phone ? 0 : Math.max(0, board.x);
  const right = phone ? viewport.width : Math.min(viewport.width, board.x + board.width);
  if (phone) {
    const docked = (await bar.boundingBox())!;
    expect(docked.x).toBe(0);
    expect(docked.width).toBe(viewport.width);
    expect(docked.y + docked.height).toBeCloseTo(viewport.height, 0);
  }
  const heights = async () =>
    bar.evaluate((el) => [...el.children].map((row) => row.getBoundingClientRect().height));
  const atRest = await heights();
  const everyControlFits = async (when: string): Promise<void> => {
    const controls = bar.locator('[data-edit-part-row] button, [data-edit-actions] button');
    const count = await controls.count();
    for (let i = 0; i < count; i += 1) {
      const control = controls.nth(i);
      const name =
        (await control.getAttribute('aria-label')) ?? (await control.textContent()) ?? `#${i}`;
      const box = (await control.boundingBox())!;
      expect(box.height, `${when}: ${name} height`).toBeGreaterThanOrEqual(tall);
      expect(box.x, `${when}: ${name} left`).toBeGreaterThanOrEqual(left - 0.5);
      expect(box.x + box.width, `${when}: ${name} right`).toBeLessThanOrEqual(right + 0.5);
      expect(box.y, `${when}: ${name} top`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${when}: ${name} bottom`).toBeLessThanOrEqual(viewport.height);
    }
    for (const selector of ['[data-edit-parts]', '[data-edit-more]']) {
      const box = (await bar.locator(selector).boundingBox())!;
      expect(box.height, `${when}: ${selector} height`).toBeGreaterThanOrEqual(tall);
      expect(box.x + box.width, `${when}: ${selector} right`).toBeLessThanOrEqual(right + 0.5);
    }
    // Undo leftmost, Done rightmost in the last row.
    const actions = (await bar.locator('[data-edit-actions]').boundingBox())!;
    const undo = (await bar.locator('[data-edit-undo]').boundingBox())!;
    const done = (await bar.locator('[data-edit-done]').boundingBox())!;
    expect(undo.x, `${when}: Undo leftmost`).toBeLessThanOrEqual(actions.x + 4);
    expect(done.x + done.width, `${when}: Done rightmost`).toBeGreaterThanOrEqual(
      actions.x + actions.width - 4,
    );
  };
  await everyControlFits('All');

  // On a phone the piece stands above the docked bar.
  const above = async (when: string): Promise<void> => {
    if (!phone) return;
    const top = (await bar.boundingBox())!.y;
    const outline = page.locator('[data-edit-overlay], [data-edit-ghost]').first();
    await expect
      .poll(async () => (await outline.boundingBox())!.y + (await outline.boundingBox())!.height, {
        message: `${when}: the selected part above the bar`,
      })
      .toBeLessThanOrEqual(top);
  };
  await above('All');

  // A drag inside All's outline moves every part by the pointer's distance.
  const frame = page.locator('[data-edit-frame="piece"]');
  const label = page.locator('[data-board-piece="full"] [data-board-label]');
  const start = (await label.boundingBox())!;
  const outline = (await frame.boundingBox())!;
  const from = { x: outline.x + outline.width / 2, y: outline.y + outline.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 15, from.y + 12, { steps: 4 });
  await page.mouse.move(from.x + 30, from.y + 24, { steps: 4 });
  await page.mouse.up();
  const end = (await label.boundingBox())!;
  expect(end.x - start.x).toBeCloseTo(30, 0);
  expect(end.y - start.y).toBeCloseTo(24, 0);
  await expect(bar.locator('[data-edit-status]')).toHaveCount(1);
  await everyControlFits('All, saving');
  await bar.locator('[data-edit-undo]').click();

  // The label: eye, text size, style; a desktop's layers to the last row.
  await bar.locator('[data-edit-part-chip="Label"]').click();
  expect(await named(bar, '[data-edit-part-row]')).toEqual([
    'data-edit-eye',
    'data-edit-text-smaller',
    'data-edit-text-larger',
    'data-edit-style',
  ]);
  expect(await named(bar, '[data-edit-actions]')).toEqual([
    'data-edit-undo',
    ...(phone ? [] : Array(4).fill('data-edit-layer')),
    'data-edit-done',
  ]);
  await everyControlFits('Label');
  await above('Label');
  // While saving the status sits beside Done: still all on screen.
  await bar.locator('[data-edit-text-larger]').click();
  await expect(bar.locator('[data-edit-status]')).toHaveCount(1);
  await everyControlFits('Label, saving');

  // A photo: its eye, then a desktop's layers.
  await bar.locator('[data-edit-part-chip="Photo 2"]').click();
  await expect(bar.locator('[data-edit-part-chip="Photo 2"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('[data-edit-frame="photo"]')).toBeVisible();
  expect(await named(bar, '[data-edit-part-row]')).toEqual([
    'data-edit-eye',
    ...(phone ? [] : Array(4).fill('data-edit-layer')),
  ]);
  expect(await named(bar, '[data-edit-actions]')).toEqual(['data-edit-undo', 'data-edit-done']);
  await everyControlFits('Photo 2');
  await above('Photo 2');
  // The rows keep their heights from part to part.
  expect(await heights()).toEqual(atRest);
  // The rest is a phone's: More holds the layer buttons.
  if (!phone) return;
  await bar.locator('[data-edit-more]').click();
  const sheet = page.locator('[data-layout-sheet]');
  await expect(page.locator('[data-layout-layers] [data-edit-layer]')).toHaveCount(4);
  await page.waitForFunction(() =>
    document
      .querySelector('[data-layout-sheet]')!
      .getAnimations()
      .every((a) => a.playState !== 'running'),
  );
  // More covers the docked bar: Undo, Done and Close sit in its header, 44px tall.
  for (const selector of [
    '[data-layout-sheet-undo]',
    '[data-layout-sheet-done]',
    '[data-layout-sheet-close]',
  ]) {
    const box = (await sheet.locator(`header ${selector}`).boundingBox())!;
    expect(box.height, `${selector} height`).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
  // The bar's tabs under the sheet: the sheet holds the part chips.
  await sheet.locator('[data-layout-parts] [data-edit-part-chip="Photo 1"]').click();
  await expect(page.locator('[data-edit-frame="photo"]')).toBeVisible();
  // Close only closes the sheet; Done ends the editing, and the sheet with it.
  await sheet.locator('[data-layout-sheet-close]').click();
  await expect(sheet).toHaveCount(0);
  await expect(bar).toBeVisible();
  await bar.locator('[data-edit-more]').click();
  await sheet.locator('[data-layout-sheet-done]').click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('[data-edit-toolbar]')).toHaveCount(0);
});

test('Icon inline turns a sticker inline and back, from the Icon tab', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone' && info.project.name !== 'desktop');
  await page.goto('/dev/board?scene=toolbar');
  const bar = await activate(page, 'sticker');
  // All has no Icon inline.
  await expect(bar.locator('[data-edit-icon-inline]')).toHaveCount(0);
  await bar.locator('[data-edit-part-chip="Icon"]').click();
  const toggle = bar.locator('[data-edit-icon-inline]');
  await expect(toggle).toHaveAttribute('data-edit-icon-inline', 'off');
  await expect(page.locator('[data-board-piece="sticker"] [data-board-sticker]')).toBeVisible();
  await expect(page.locator('[data-edit-frame="icon"]')).toBeVisible();
  await toggle.click();
  // Inline: in the label, outlined, no handles; the Icon tab still selected.
  await expect(toggle).toHaveAttribute('data-edit-icon-inline', 'on');
  await expect(page.locator('[data-board-piece="sticker"] [data-board-sticker]')).toHaveCount(0);
  await expect(page.locator('[data-board-piece="sticker"] [data-edit-inline-icon]')).toBeVisible();
  await expect(page.locator('[data-edit-frame="icon"]')).toHaveCount(0);
  await expect(bar.locator('[data-edit-part-chip="Icon"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await toggle.click();
  await expect(page.locator('[data-board-piece="sticker"] [data-board-sticker]')).toBeVisible();
  await expect(page.locator('[data-edit-frame="icon"]')).toBeVisible();
});
