'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

import type { Card, GridColumn } from '@/features/home/grid';
import { useBoardSpan } from '@/features/month-board/board-span';
import { SheetFrame } from '@/features/splash-sheet/sheet-frame';
import { Switch } from '@/features/pool/switch';
import type { IsoDate } from '@/lib/time';

import { shareFile } from './capture';
import { ExportBoard } from './export-board';
import { PreviewSkeleton } from './preview-skeleton';
import type { ShareSpan } from './range';
import { useShareImage } from './use-share-image';

const SPANS: { span: ShareSpan; name: string }[] = [
  { span: 'week', name: 'This week' },
  { span: 'month', name: 'This month' },
];

/**
 * Share as image (H63): the Calendar as a story, 1080×1920. This week or
 * this month (the board's span first); in a pool, the switch for the pool's
 * name and its members' faces, off. The preview is the image itself, made
 * before Share is tapped; Share opens the phone's share sheet with it, or
 * downloads it where there is none. Nothing is uploaded: the page is drawn
 * offscreen here, and only my own photos are on it.
 */
export function ShareSheet({
  cards,
  lanes,
  today,
  poolName,
  onClose,
}: {
  /** The Calendar's cards, with its layouts. */
  cards: Card[];
  lanes: Pick<GridColumn, 'id' | 'icon' | 'name'>[];
  today: IsoDate;
  /** In a pool, its name: the switch is offered. On Home, none. */
  poolName: string | null;
  onClose: () => void;
}) {
  const [boardSpan] = useBoardSpan();
  const [span, setSpan] = useState<ShareSpan>(boardSpan);
  const [faces, setFaces] = useState(false);
  const { range, redacted, photos, image, onSettled } = useShareImage({
    cards,
    today,
    span,
    faces: poolName !== null && faces,
  });
  const [failedShare, setFailedShare] = useState(false);
  const canShare =
    image.state === 'ready' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    navigator.canShare?.({ files: [image.file] }) === true;

  const share = (): void => {
    if (image.state !== 'ready') return;
    setFailedShare(false);
    // Straight from the tap, the file made already (Safari's activation).
    shareFile(image.file).catch((error: unknown) => {
      console.error('[during] share image not shared', error);
      setFailedShare(true);
    });
  };

  return (
    <SheetFrame
      label="Share as image"
      onClose={onClose}
      data={{ 'data-share-sheet': '' }}
      className="surface"
      bodyClassName="px-6 pt-7"
    >
      <h2 className="text-main-900 mb-5 text-xl font-semibold">Share as image</h2>
      <div role="radiogroup" aria-label="Range" className="mb-4 flex gap-2">
        {SPANS.map((option) => (
          <button
            key={option.span}
            type="button"
            role="radio"
            aria-checked={span === option.span}
            data-share-span={option.span}
            onClick={() => setSpan(option.span)}
            // Selection is ink (H20f).
            className={`rounded-full px-4 py-2 text-sm font-medium ${span === option.span ? 'bg-ink text-white' : 'bg-pool-100 text-pool-500'}`}
          >
            {option.name}
          </button>
        ))}
      </div>
      {poolName !== null ? (
        <label className="text-ink mb-4 flex items-center justify-between gap-3 text-sm">
          Show pool name and faces
          <Switch on={faces} onChange={setFaces} label="Show pool name and faces" tone="ink" />
        </label>
      ) : null}
      <div
        data-share-preview={image.state}
        className="bg-pool-100 mx-auto mb-5 flex aspect-[9/16] w-full max-w-[240px] items-center justify-center overflow-hidden rounded-2xl"
      >
        {image.state === 'ready' ? (
          // The PNG itself: what is shared is what is shown.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt={`The Calendar, ${range.title}`} className="h-full w-full" />
        ) : image.state === 'failed' ? (
          <span className="text-pool-500 text-sm">Could not draw the image.</span>
        ) : (
          <PreviewSkeleton span={span} />
        )}
      </div>
      {failedShare ? (
        <p className="text-pool-500 mb-2 text-center text-sm">Could not share it. Try again.</p>
      ) : null}
      <button
        type="button"
        data-share-go
        disabled={image.state !== 'ready'}
        onClick={share}
        className="bg-main-900 w-full rounded-full py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        {image.state === 'ready' && !canShare ? 'Download' : 'Share'}
      </button>
      {photos !== null && typeof document !== 'undefined'
        ? createPortal(
            // Offscreen, at its own size: drawn only to be captured.
            <div
              aria-hidden
              data-share-stage
              className="pointer-events-none fixed top-0"
              style={{ left: -10_000 }}
            >
              <ExportBoard
                key={`${range.span}:${range.first}`}
                redacted={redacted}
                range={range}
                lanes={lanes}
                photos={photos}
                placeName={poolName !== null && faces ? poolName : null}
                onSettled={onSettled}
              />
            </div>,
            document.body,
          )
        : null}
    </SheetFrame>
  );
}
