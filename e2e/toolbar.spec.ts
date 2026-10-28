import { expect, test } from '@playwright/test';

/**
 * The toolbar (review), one structure on every width: the parts as tabs,
 * the selected part's own controls, the actions — the layer buttons in the
 * actions on a desktop, More's on a phone. With a post of every part active
 * on /dev/board?scene=toolbar, every control is wholly on screen, inside the
 * board, 44px tall on a phone and 36px on a desktop; tabs switch the part;
 * Icon inline turns a sticker inline and back.
 */
test('every toolbar control is on screen, inside the board; tabs and Icon inline work', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone' && info.project.name !== 'desktop');
  const phone = info.project.name === 'phone';
  const tall = phone ? 44 : 36;
  await page.goto('/dev/board?scene=toolbar');
  const label = page.locator('[data-board-piece="full"] [data-board-label]');
  await label.waitFor();
  await label.click();
  await label.click();
  const bar = page.locator('[data-edit-toolbar]');
  await bar.waitFor();
  await expect(bar.locator('[data-edit-part-chip]')).toHaveText([
    'Label',
    'Icon',
    'Photo 1',
    'Photo 2',
    'Photo 3',
    'Wave',
  ]);

  // Three rows: the tabs, the part's own (the label's: eye, text size, style), the actions.
  const rows = await bar.evaluate((el) =>
    [...el.children].map((row) =>
      row.hasAttribute('data-edit-parts')
        ? 'parts'
        : row.hasAttribute('data-edit-part-row')
          ? 'part'
          : row.hasAttribute('data-edit-actions')
            ? 'actions'
            : '?',
    ),
  );
  expect(rows).toEqual(['parts', 'part', 'actions']);
  const named = (selector: string) =>
    bar
      .locator(`${selector} button`)
      .evaluateAll((buttons) =>
        buttons.map(
          (b) =>
            [
              'data-edit-eye',
              'data-edit-text-smaller',
              'data-edit-text-larger',
              'data-edit-style',
              'data-edit-icon-inline',
              'data-edit-layer',
              'data-edit-undo',
              'data-edit-more',
              'data-edit-done',
            ].find((a) => b.hasAttribute(a)) ?? '?',
        ),
      );
  expect(await named('[data-edit-part-row]')).toEqual([
    'data-edit-eye',
    'data-edit-text-smaller',
    'data-edit-text-larger',
    'data-edit-style',
  ]);
  expect(await named('[data-edit-actions]')).toEqual([
    ...(phone ? [] : Array(4).fill('data-edit-layer')),
    'data-edit-undo',
    'data-edit-more',
    'data-edit-done',
  ]);

  const viewport = page.viewportSize()!;
  const board = (await page.locator('[data-board-scroller]').boundingBox())!;
  const heights = async () =>
    bar.evaluate((el) =>
      [...el.querySelectorAll('[data-edit-part-row], [data-edit-actions]')].map(
        (row) => row.getBoundingClientRect().height,
      ),
    );
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
      expect(box.x, `${when}: ${name} left`).toBeGreaterThanOrEqual(Math.max(0, board.x) - 0.5);
      expect(box.x + box.width, `${when}: ${name} right`).toBeLessThanOrEqual(
        Math.min(viewport.width, board.x + board.width) + 0.5,
      );
      expect(box.y, `${when}: ${name} top`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${when}: ${name} bottom`).toBeLessThanOrEqual(viewport.height);
    }
    // The tab row stays within the board, scrolling sideways inside it.
    const tabs = (await bar.locator('[data-edit-parts]').boundingBox())!;
    expect(tabs.x + tabs.width, `${when}: tabs right`).toBeLessThanOrEqual(
      Math.min(viewport.width, board.x + board.width) + 0.5,
    );
  };
  await everyControlFits('at rest');
  // While saving the status joins the actions: still all on screen.
  await bar.locator('[data-edit-text-larger]').click();
  await expect(bar.locator('[data-edit-status]')).toHaveCount(1);
  await everyControlFits('saving');

  // A tab switches the part: Photo 2, its frame, its own row — the eye alone.
  await bar.locator('[data-edit-part-chip="Photo 2"]').click();
  await expect(bar.locator('[data-edit-part-chip="Photo 2"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('[data-edit-frame="photo"]')).toBeVisible();
  expect(await named('[data-edit-part-row]')).toEqual(['data-edit-eye']);
  // The rows keep their heights from part to part.
  expect(await heights()).toEqual(atRest);
  await bar.locator('[data-edit-part-chip="Label"]').click();
  // The rest is a phone's: More holds the layer buttons.
  if (!phone) return;
  // The layer buttons wait in More, at its top.
  await bar.locator('[data-edit-more]').click();
  const sheet = page.locator('[data-layout-sheet]');
  await expect(page.locator('[data-layout-layers] [data-edit-layer]')).toHaveCount(4);

  // More covers the toolbar's lower row: Undo, Done and Close sit in its
  // header, whole on screen, 44px tall.
  await page.waitForFunction(() =>
    document
      .querySelector('[data-layout-sheet]')!
      .getAnimations()
      .every((a) => a.playState !== 'running'),
  );
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

  // Here the toolbar's chips row shows whole above the sheet: it stays the
  // chips' place, uncovered, and the sheet adds none.
  const sheetTop = (await sheet.boundingBox())!.y;
  const row = (await bar.locator('[data-edit-parts]').boundingBox())!;
  expect(row.y + row.height).toBeLessThanOrEqual(sheetTop);
  expect(await sheet.locator('[data-layout-parts]').count()).toBe(0);
  await page.locator('[data-edit-toolbar] [data-edit-part-chip="Photo 2"]').click();
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
  const label = page.locator('[data-board-piece="sticker"] [data-board-label]');
  await label.waitFor();
  await label.click();
  await label.click();
  const bar = page.locator('[data-edit-toolbar]');
  await bar.waitFor();
  // The Label tab has no Icon inline.
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
