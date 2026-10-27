import { expect, test } from '@playwright/test';

import { dragHandle, driftAfter, select, topLeft, type Part } from './measure';

/**
 * Resizing on the board follows the pointer one to one and holds the
 * top-left where it was (review, 2026-10-27): a label's width bar, a
 * sticker's corner and a photo's corner, square and turned 20°, dragged
 * 100px along the part's own axis. The dragged edge or corner travels 100px
 * (±3), and the top-left drifts under 2px on every frame and after the
 * release has been saved and drawn again.
 */
const PARTS: Part[] = ['width', 'icon', 'photo'];

for (const tilt of [0, 20]) {
  for (const part of PARTS) {
    test(`${part} at ${tilt}°: one to one, the top-left held`, async ({ page }) => {
      await page.goto(`/dev/board?tilt=${tilt}`);
      await page.locator('[data-board-piece="label"]').waitFor();
      await select(page, part);
      const before = await topLeft(page);

      const { samples, release } = await dragHandle(page, part, 100, 25);
      const last = samples.at(-1)!;
      expect(Math.abs(last.moved - 100), `moved ${last.moved.toFixed(1)}px`).toBeLessThanOrEqual(3);
      for (const s of samples) {
        // One to one all the way, not only at the end (a compounding pull
        // overshoots early) — past the first 4px, which a pull ignores.
        if (s.pointer > 4)
          expect(Math.abs(s.moved - s.pointer), `at ${s.pointer}px`).toBeLessThanOrEqual(3);
        expect(s.drift, `top-left drift at ${s.pointer}px`).toBeLessThan(2);
      }

      await release();
      expect(await driftAfter(page, before), 'top-left drift after the release').toBeLessThan(2);
    });
  }
}
