import { expect, test, type Page } from '@playwright/test';

/**
 * One stacking order for the whole board (review, 2026-10-27), on the
 * /dev/board `layers` scene: Oct 23's photo and caption, and Oct 24's big
 * 📚 sticker hanging left over them from its label's corner.
 */
const STICKER = '[data-board-piece="cameron"] [data-board-sticker]';
const PHOTO = '[data-board-piece="oct23"] [data-board-photo-card]';
const CAPTION = '[data-board-piece="oct23"] [data-board-label]';

/** Where two elements overlap, which is drawn on top: 'a', 'b', or null when they do not meet. */
async function onTop(page: Page, a: string, b: string): Promise<'a' | 'b' | null> {
  return page.evaluate(
    ([a, b]) => {
      const ea = document.querySelector(a)!;
      const eb = document.querySelector(b)!;
      const ra = ea.getBoundingClientRect();
      const rb = eb.getBoundingClientRect();
      const x0 = Math.max(ra.left, rb.left);
      const x1 = Math.min(ra.right, rb.right);
      const y0 = Math.max(ra.top, rb.top);
      const y1 = Math.min(ra.bottom, rb.bottom);
      if (x1 - x0 < 2 || y1 - y0 < 2) return null;
      for (const el of document.elementsFromPoint((x0 + x1) / 2, (y0 + y1) / 2)) {
        if (ea === el || ea.contains(el)) return 'a';
        if (eb === el || eb.contains(el)) return 'b';
      }
      return null;
    },
    [a, b],
  );
}

/**
 * Makes a piece active: its record to the top, then on. On a phone the
 * layer buttons are More's (review): opened, so they are there to press.
 */
async function activate(page: Page, id: string): Promise<void> {
  const label = page.locator(`[data-board-piece="${id}"] [data-board-label]`);
  await label.click({ force: true });
  await label.click({ force: true });
  const bar = page.locator(`[data-board-piece="${id}"] [data-edit-toolbar]`);
  await bar.waitFor();
  if ((await bar.getAttribute('data-phone')) !== null) {
    await bar.locator('[data-edit-more]').click();
    await page.locator('[data-layout-layers]').waitFor();
  }
}

const layer = (page: Page, how: string) => page.locator(`[data-edit-layer="${how}"]`);

test('a later day draws over an earlier one, even when the earlier is moved by hand', async ({
  page,
}) => {
  await page.goto('/dev/board?scene=layers&moved=1');
  await page.locator(STICKER).waitFor();
  expect(await onTop(page, STICKER, PHOTO)).toBe('a');
  // The board is one stacking layer: nothing between a part and it makes another.
  const contexts = await page.evaluate((sel) => {
    const out: string[] = [];
    const sticker = document.querySelector(sel)!;
    for (
      let el = sticker.parentElement;
      el && !el.hasAttribute('data-board-canvas');
      el = el.parentElement
    ) {
      const cs = getComputedStyle(el);
      if (
        (cs.position !== 'static' && cs.zIndex !== 'auto') ||
        cs.opacity !== '1' ||
        cs.transform !== 'none' ||
        cs.isolation === 'isolate'
      )
        out.push(el.outerHTML.slice(0, 80));
    }
    return out;
  }, STICKER);
  expect(contexts).toEqual([]);
});

test('a sticker set to front draws above a neighbouring day’s label and photo', async ({
  page,
}) => {
  await page.goto('/dev/board?scene=layers');
  await page.locator(STICKER).waitFor();
  // Oct 23 to the front first: now over the sticker.
  await activate(page, 'oct23');
  await layer(page, 'front').click();
  expect(await onTop(page, STICKER, PHOTO)).toBe('b');
  // Then Oct 24 to the front: its sticker over both of Oct 23's parts.
  await activate(page, 'cameron');
  await expect(layer(page, 'front')).toBeEnabled();
  await layer(page, 'front').click();
  expect(await onTop(page, STICKER, PHOTO)).toBe('a');
  const caption = await onTop(page, STICKER, CAPTION);
  if (caption !== null) expect(caption).toBe('a');
  // At the front of what it overlaps: nothing more to bring forward.
  await expect(layer(page, 'front')).toBeDisabled();
  await expect(layer(page, 'forward')).toBeDisabled();
});

test('a piece sent to back draws below every overlapping piece in other days', async ({ page }) => {
  await page.goto('/dev/board?scene=layers');
  await page.locator(STICKER).waitFor();
  await activate(page, 'cameron');
  await expect(layer(page, 'forward')).toBeDisabled();
  await layer(page, 'back').click();
  expect(await onTop(page, STICKER, PHOTO)).toBe('b');
  const caption = await onTop(page, STICKER, CAPTION);
  if (caption !== null) expect(caption).toBe('b');
  await expect(layer(page, 'back')).toBeDisabled();
  await expect(layer(page, 'backward')).toBeDisabled();
  // One step forward is past the one piece it overlaps: on top again.
  await layer(page, 'forward').click();
  expect(await onTop(page, STICKER, PHOTO)).toBe('a');
});

test('Cmd/Ctrl+[ sends backward and Cmd/Ctrl+Shift+] brings to the front', async ({ page }) => {
  await page.goto('/dev/board?scene=layers');
  await page.locator(STICKER).waitFor();
  await activate(page, 'cameron');
  await page.keyboard.press('ControlOrMeta+BracketLeft');
  expect(await onTop(page, STICKER, PHOTO)).toBe('b');
  await page.keyboard.press('ControlOrMeta+Shift+BracketRight');
  expect(await onTop(page, STICKER, PHOTO)).toBe('a');
});
