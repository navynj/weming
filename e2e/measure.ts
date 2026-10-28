import type { Page } from '@playwright/test';

/**
 * Direct manipulation measured in a real browser (review): a handle dragged
 * along the part's own axis, the part's corners read from the frame's
 * markers every frame. Shared by the spec and by a one-off diagnosis.
 */
export type Part = 'width' | 'icon' | 'photo';
export type Sample = { pointer: number; moved: number; drift: number };

type Pt = { x: number; y: number };

const nextFrame = (page: Page): Promise<void> =>
  page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );

/** The selected part's corners on screen, from the frame's markers, and the frame's turn. */
async function corners(page: Page): Promise<{ tl: Pt; br: Pt; tr: Pt; tilt: number }> {
  return page.evaluate(() => {
    const at = (s: string) => {
      const r = document.querySelector(s)!.getBoundingClientRect();
      return { x: r.left, y: r.top };
    };
    const tl = at('[data-edit-corner="tl"]');
    const br = at('[data-edit-corner="br"]');
    // The part's own turn, from its transform: its width runs along it.
    const part = document.querySelector('[data-edit-frame]')!.parentElement!;
    const m = new DOMMatrixReadOnly(getComputedStyle(part).transform);
    const tilt = Math.atan2(m.b, m.a);
    const v = { x: br.x - tl.x, y: br.y - tl.y };
    const w = v.x * Math.cos(tilt) + v.y * Math.sin(tilt);
    const tr = { x: tl.x + w * Math.cos(tilt), y: tl.y + w * Math.sin(tilt) };
    return { tl, br, tr, tilt };
  });
}

/** Activates the part: the label's record to the top, then on, then the part itself. */
export async function select(page: Page, part: Part): Promise<void> {
  const id = part === 'width' ? 'label' : part === 'icon' ? 'sticker' : 'photo';
  const label = page.locator(`[data-board-piece="${id}"] [data-board-label]`);
  await label.click();
  await label.click();
  if (part === 'icon')
    await page.locator('[data-board-piece="sticker"] [data-board-sticker]').click();
  if (part === 'photo') await page.locator('[data-board-photo-card="fixture/photo.webp"]').click();
  await page.locator(`[data-edit-frame="${part === 'width' ? 'label' : part}"]`).waitFor();
}

/**
 * Drags the part's handle `distance` px along its own axis — a width along
 * the label, a corner along the diagonal — in `steps`, recording each frame:
 * how far the pointer has gone, how far the dragged edge or corner has gone
 * along the same line, and how far the top-left corner has drifted.
 */
export async function dragHandle(
  page: Page,
  part: Part,
  distance = 100,
  steps = 25,
): Promise<{ samples: Sample[]; release: () => Promise<void> }> {
  const handle = page.locator(`[data-edit-handle="${part === 'width' ? 'width' : 'size'}"]`);
  const box = (await handle.boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const c0 = await corners(page);
  const dir =
    part === 'width'
      ? { x: Math.cos(c0.tilt), y: Math.sin(c0.tilt) }
      : (() => {
          // Along the part's own diagonal: a photo keeps its ratio, so it is rarely square.
          const d = Math.hypot(c0.br.x - c0.tl.x, c0.br.y - c0.tl.y);
          return { x: (c0.br.x - c0.tl.x) / d, y: (c0.br.y - c0.tl.y) / d };
        })();
  const dragged = (c: typeof c0): Pt =>
    part === 'width' ? { x: (c.tr.x + c.br.x) / 2, y: (c.tr.y + c.br.y) / 2 } : c.br;
  const p0 = dragged(c0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const samples: Sample[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const along = (distance * i) / steps;
    await page.mouse.move(start.x + dir.x * along, start.y + dir.y * along);
    await nextFrame(page);
    const c = await corners(page);
    const p = dragged(c);
    samples.push({
      pointer: along,
      moved: (p.x - p0.x) * dir.x + (p.y - p0.y) * dir.y,
      drift: Math.hypot(c.tl.x - c0.tl.x, c.tl.y - c0.tl.y),
    });
  }
  const release = async (): Promise<void> => {
    await page.mouse.up();
  };
  return { samples, release };
}

/** The top-left corner's drift from where it was before the drag, after release and the save. */
export async function driftAfter(page: Page, before: Pt): Promise<number> {
  for (let i = 0; i < 6; i += 1) await nextFrame(page);
  const c = await corners(page);
  return Math.hypot(c.tl.x - before.x, c.tl.y - before.y);
}

export async function topLeft(page: Page): Promise<Pt> {
  return (await corners(page)).tl;
}
