import { expect, test, type Page } from '@playwright/test';

import { activate } from './measure';

/**
 * A photo resized by hand keeps its automatic top-left (review, 2026-10-27),
 * and its caption starts at the photo's left edge: a 100px pull of the
 * corner grows the photo 100px, the caption box's left edge stays (0px),
 * its centred words move half the growth (50px) and its right edge all of
 * it (100px), ±3, and nothing ever moves left — for a photo the engine sets
 * left in its lane and one it sets right. Desktop only: on a phone a 100px
 * growth is past a photo's two-lane limit.
 */
type Edges = { left: number; words: number; right: number };

async function captionEdges(page: Page, id: string): Promise<Edges> {
  return page.evaluate((id) => {
    const label = document.querySelector(`[data-board-piece="${id}"] [data-board-label]`)!;
    const text = label.querySelector('[data-board-text]')!;
    const range = document.createRange();
    range.selectNodeContents(text);
    const words = range.getBoundingClientRect();
    const box = label.getBoundingClientRect();
    return { left: box.left, words: words.left, right: box.right };
  }, id);
}

for (const id of ['photo-left', 'photo-right']) {
  test(`${id}: the caption keeps to the photo's left edge as it grows`, async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'a 100px growth is past a phone photo’s limit');
    await page.goto('/dev/board?scene=captions');
    await page.locator(`[data-board-piece="${id}"]`).waitFor();
    const bar = await activate(page, id);
    await bar.locator('[data-edit-part-chip="Label"]').click();
    // Near its top: the caption's rotate handle stands over the photo's lower half.
    await page
      .locator(`[data-board-photo-card="fixture/${id}.webp"]`)
      .click({ position: { x: 20, y: 8 } });
    await page.locator('[data-edit-frame="photo"]').waitFor();
    const before = await captionEdges(page, id);
    const handle = (await page.locator('[data-edit-handle="size"]').boundingBox())!;
    const x0 = handle.x + handle.width / 2;
    const y0 = handle.y + handle.height / 2;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 20; i += 1) {
      await page.mouse.move(x0 + i * 5, y0 + i * 5);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
      const now = await captionEdges(page, id);
      // Never to the left, at any frame.
      expect(now.left - before.left, `left edge at ${i * 5}px`).toBeGreaterThan(-0.5);
    }
    await page.mouse.up();
    await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
    const after = await captionEdges(page, id);
    expect(Math.abs(after.left - before.left)).toBeLessThanOrEqual(3);
    expect(Math.abs(after.words - before.words - 50)).toBeLessThanOrEqual(3);
    expect(Math.abs(after.right - before.right - 100)).toBeLessThanOrEqual(3);
  });
}
