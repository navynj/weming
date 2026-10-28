import { expect, test, type Page } from '@playwright/test';

/**
 * Photos are never cropped (review, 2026-10-27), on /dev/board?scene=photos:
 * a 3:1 and a 1:3 photo alone draw in boxes of their own ratio; piles of two
 * and three (wide, tall and square mixed) show at least half of every
 * photo, crop none, and keep the caption clear of every photo.
 */

async function open(page: Page): Promise<void> {
  await page.goto('/dev/board?scene=photos');
  await page.locator('[data-board-piece="pile-three"]').waitFor();
  // Every image loaded, and the layout re-run with what each taught it.
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>('[data-board-photo]')].every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  );
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );
}

/** Each photo of a piece: its laid-out ratio (before its tilt) and its natural one. */
async function ratios(page: Page, id: string) {
  return page.evaluate((id) => {
    return [
      ...document.querySelectorAll<HTMLImageElement>(
        `[data-board-piece="${id}"] [data-board-photo]`,
      ),
    ].map((img) => ({
      w: img.offsetWidth,
      h: img.offsetHeight,
      natural: img.naturalWidth / img.naturalHeight,
      fit: getComputedStyle(img).objectFit,
    }));
  }, id);
}

for (const [id, ratio] of [
  ['ratio-wide', 3],
  ['ratio-tall', 1 / 3],
] as const) {
  test(`${id}: the photo's box is its own ratio, nothing cropped`, async ({ page }) => {
    await open(page);
    const box = (await page
      .locator(`[data-board-piece="${id}"] [data-board-photo-card]`)
      .boundingBox())!;
    // Its own ratio, to the pixel the layout rounds to.
    expect(Math.abs(box.height - box.width / ratio)).toBeLessThanOrEqual(1);
    const [photo] = await ratios(page, id);
    expect(photo.natural).toBeCloseTo(ratio, 2);
    expect(Math.abs(photo.h - photo.w / photo.natural)).toBeLessThanOrEqual(1);
    expect(photo.fit).toBe('contain');
  });
}

for (const id of ['pile-two', 'pile-three', 'pile-mixed']) {
  test(`${id}: every photo at least half seen, none cropped, the caption clear`, async ({
    page,
  }) => {
    await open(page);
    for (const photo of await ratios(page, id)) {
      expect(Math.abs(photo.h - photo.w / photo.natural)).toBeLessThanOrEqual(1);
      expect(photo.fit).toBe('contain');
    }
    const result = await page.evaluate((id) => {
      const piece = document.querySelector(`[data-board-piece="${id}"]`)!;
      const imgs = [...piece.querySelectorAll<HTMLImageElement>('[data-board-photo]')];
      const all = [...document.querySelectorAll('[data-board-photo]')];
      const steps = 30;
      const shares = imgs.map((img) => {
        const r = img.getBoundingClientRect();
        let inside = 0;
        let seen = 0;
        for (let i = 0; i < steps; i += 1) {
          for (let j = 0; j < steps; j += 1) {
            const x = r.left + ((i + 0.5) / steps) * r.width;
            const y = r.top + ((j + 0.5) / steps) * r.height;
            const stack = document.elementsFromPoint(x, y);
            if (!stack.includes(img)) continue;
            inside += 1;
            const topPhoto = stack.find((el) => all.includes(el));
            if (topPhoto === img) seen += 1;
          }
        }
        return inside ? seen / inside : 0;
      });
      // The caption: no point of it lies on any photo.
      const label = piece.querySelector('[data-board-label]')!.getBoundingClientRect();
      let onPhoto = 0;
      for (let i = 0; i < steps; i += 1) {
        for (let j = 0; j < steps; j += 1) {
          const x = label.left + ((i + 0.5) / steps) * label.width;
          const y = label.top + ((j + 0.5) / steps) * label.height;
          if (document.elementsFromPoint(x, y).some((el) => all.includes(el))) onPhoto += 1;
        }
      }
      return { count: imgs.length, shares, onPhoto };
    }, id);
    expect(result.count).toBe(id === 'pile-two' ? 2 : 3);
    for (const [at, share] of result.shares.entries()) {
      expect(share, `photo ${at} seen`).toBeGreaterThanOrEqual(0.5);
    }
    expect(result.onPhoto, 'caption points on a photo').toBe(0);
  });
}
