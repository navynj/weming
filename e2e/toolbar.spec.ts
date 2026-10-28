import { expect, test } from '@playwright/test';

/**
 * The phone's toolbar (review): with a post of every part active — its
 * label, three photos and a wave, on /dev/board?scene=toolbar — every
 * control of both rows is wholly on screen, inside the board, and at least
 * 44px tall; the layer buttons are More's.
 */
test('every toolbar control is on screen, inside the board, 44px tall', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the two-row toolbar is a phone’s');
  await page.goto('/dev/board?scene=toolbar');
  const label = page.locator('[data-board-piece="full"] [data-board-label]');
  await label.waitFor();
  await label.click();
  await label.click();
  const bar = page.locator('[data-edit-toolbar]');
  await bar.waitFor();
  await expect(page.locator('[data-edit-part-chip]')).toHaveText([
    'Label',
    'Photo 1',
    'Photo 2',
    'Photo 3',
    'Wave',
  ]);
  expect(await bar.locator('[data-edit-layer]').count()).toBe(0);

  // Row 2 (0058): the text size, the style swatch, the eye, Undo, More, Done.
  const row2 = await bar
    .locator('[data-edit-actions] button')
    .evaluateAll((buttons) =>
      buttons.map(
        (b) =>
          [
            'data-edit-text-smaller',
            'data-edit-text-larger',
            'data-edit-style',
            'data-edit-eye',
            'data-edit-undo',
            'data-edit-more',
            'data-edit-done',
          ].find((a) => b.hasAttribute(a)) ?? b.getAttribute('aria-label'),
      ),
    );
  expect(row2).toEqual([
    'data-edit-text-smaller',
    'data-edit-text-larger',
    'data-edit-style',
    'data-edit-eye',
    'data-edit-undo',
    'data-edit-more',
    'data-edit-done',
  ]);

  const viewport = page.viewportSize()!;
  const board = (await page.locator('[data-board-scroller]').boundingBox())!;
  const everyControlFits = async (when: string): Promise<void> => {
    const controls = bar.locator('button');
    const count = await controls.count();
    expect(count).toBeGreaterThanOrEqual(12);
    for (let i = 0; i < count; i += 1) {
      const control = controls.nth(i);
      const name =
        (await control.getAttribute('aria-label')) ?? (await control.textContent()) ?? `#${i}`;
      const box = (await control.boundingBox())!;
      expect(box.height, `${when}: ${name} height`).toBeGreaterThanOrEqual(44);
      expect(box.x, `${when}: ${name} left`).toBeGreaterThanOrEqual(Math.max(0, board.x) - 0.5);
      expect(box.x + box.width, `${when}: ${name} right`).toBeLessThanOrEqual(
        Math.min(viewport.width, board.x + board.width) + 0.5,
      );
      expect(box.y, `${when}: ${name} top`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${when}: ${name} bottom`).toBeLessThanOrEqual(viewport.height);
    }
  };
  await everyControlFits('at rest');
  // While saving, the status takes its place in the row as an icon: still all on screen.
  await bar.locator('[data-edit-text-larger]').click();
  await expect(bar.locator('[data-edit-status]')).toHaveCount(1);
  await everyControlFits('saving');

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
