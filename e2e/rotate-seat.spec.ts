import { expect, test } from '@playwright/test';

import { activate, showPiece } from './measure';

/**
 * The rotate handle keeps off the piece's other parts (review): on a
 * phone's half week the fixture's small photo sits right above its label,
 * where the label's handle used to stand. With the label active, the
 * handle stands elsewhere, and a tap on the photo's centre selects it.
 */
test('a small photo above its label is a tap away, its centre clear of the handle', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'the half week is a phone’s');
  await page.goto('/dev/board');
  await showPiece(page, 'photo');
  expect(await page.locator('[data-board-header]').count()).toBe(4);
  const label = page.locator('[data-board-piece="photo"] [data-board-label]');
  const bar = await activate(page, 'photo');
  await bar.locator('[data-edit-part-chip="Label"]').click();
  await page.locator('[data-edit-frame="label"]').waitFor();

  const photo = page.locator('[data-board-photo-card="fixture/photo.webp"]');
  const p = (await photo.boundingBox())!;
  const l = (await label.boundingBox())!;
  // The case under test: a small photo, directly above its label.
  expect(p.width).toBeLessThan(80);
  expect(p.y + p.height).toBeLessThanOrEqual(l.y + 2);

  const seat = page.locator('[data-edit-rotate-seat]');
  expect(await seat.getAttribute('data-edit-rotate-seat')).not.toBe('top');
  expect(await seat.getAttribute('data-clear')).toBe('');
  // Its hit area lies on no part of the photo.
  const h = (await page.locator('[data-edit-handle="rotate"]').boundingBox())!;
  const apart =
    h.x >= p.x + p.width || p.x >= h.x + h.width || h.y >= p.y + p.height || p.y >= h.y + h.height;
  expect(apart).toBe(true);

  // A person's tap, on the photo's centre.
  await page.mouse.click(p.x + p.width / 2, p.y + p.height / 2);
  await expect(page.locator('[data-edit-frame="photo"]')).toBeVisible();
  // Its tab, selected (review: the parts are tabs).
  await expect(page.locator('[data-edit-toolbar] [data-edit-part-chip="Photo 1"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
