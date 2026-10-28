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

  const viewport = page.viewportSize()!;
  const board = (await page.locator('[data-board-scroller]').boundingBox())!;
  const controls = bar.locator('button');
  const count = await controls.count();
  expect(count).toBeGreaterThanOrEqual(10);
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    const name =
      (await control.getAttribute('aria-label')) ?? (await control.textContent()) ?? `#${i}`;
    const box = (await control.boundingBox())!;
    expect(box.height, `${name} height`).toBeGreaterThanOrEqual(44);
    expect(box.x, `${name} left`).toBeGreaterThanOrEqual(Math.max(0, board.x) - 0.5);
    expect(box.x + box.width, `${name} right`).toBeLessThanOrEqual(
      Math.min(viewport.width, board.x + board.width) + 0.5,
    );
    expect(box.y, `${name} top`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${name} bottom`).toBeLessThanOrEqual(viewport.height);
  }

  // The layer buttons wait in More, at its top.
  await bar.locator('[data-edit-more]').click();
  await expect(page.locator('[data-layout-layers] [data-edit-layer]')).toHaveCount(4);
});
