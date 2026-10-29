'use client';

import type { Card } from '@/features/home/grid';
import { boardPhotos } from '@/features/month-board/board-layout';
import { PHOTOS_SHOWN } from '@/features/month-board/layout';
import { signExportMedia, type SignedMedia } from '@/lib/media';

import { EXPORT_H, EXPORT_SCALE, EXPORT_W } from './export-board';
import type { ShareRange } from './range';

/**
 * The photos and videos a shared image draws (H63), as data URLs by path:
 * mine alone (the server checks who wrote each). A photo is signed fresh and
 * fetched here; a video's thumbnail comes back from the server already a
 * data URL. Inlined before the page is drawn, so the capture fetches nothing
 * and nothing can be missing from it. The fan shows three at most; no more
 * are asked for.
 */
export async function loadExportPhotos(cards: Card[]): Promise<SignedMedia> {
  const wanted = cards.flatMap((card) =>
    boardPhotos(card.photos, card.layout)
      .slice(0, PHOTOS_SHOWN)
      .map(({ rippleId, path }) => ({ rippleId, path })),
  );
  if (wanted.length === 0) return {};
  const signed = await signExportMedia(wanted);
  const entries = await Promise.all(
    Object.entries(signed).map(async ([path, url]) => [
      path,
      url === null ? null : url.startsWith('data:') ? url : await inline(url),
    ]),
  );
  return Object.fromEntries(entries) as SignedMedia;
}

/** A URL's bytes as a data URL; null when they could not be had (a placeholder stays). */
async function inline(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * The page as a PNG, 1080×1920. Its background is the ground's own colour,
 * painted, so a cutout's transparency never reaches the story as black.
 * The library loads with the sheet, never with the app.
 */
export async function captureExport(root: HTMLElement): Promise<Blob> {
  const { domToBlob } = await import('modern-screenshot');
  return domToBlob(root, {
    width: EXPORT_W,
    height: EXPORT_H,
    scale: EXPORT_SCALE,
    backgroundColor: getComputedStyle(root).backgroundColor,
    type: 'image/png',
    font: { preferredFormat: 'woff2' },
  });
}

export function exportFileName(range: ShareRange): string {
  return `weming-${range.span}-${range.first}.png`;
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * The share sheet with the file (iOS Safari and Android Chrome offer
 * Instagram there), else a download. Called straight from the tap, with the
 * file already made: Safari refuses `share()` once the tap is a long await
 * behind it.
 */
export async function shareFile(file: File): Promise<ShareOutcome> {
  const data = { files: [file] };
  if (typeof navigator.share === 'function' && navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (error) {
      // Closed without choosing: nothing to do.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }
  download(file);
  return 'downloaded';
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  // After the browser has taken it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
