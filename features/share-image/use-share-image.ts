'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Card } from '@/features/home/grid';
import type { SignedMedia } from '@/lib/media';
import type { IsoDate } from '@/lib/time';

import { captureExport, exportFileName, loadExportPhotos } from './capture';
import { inRange, shareRange, type ShareRange, type ShareSpan } from './range';
import { redactForExport, type Redacted } from './redact';

export type ShareImage =
  { state: 'drawing' } | { state: 'ready'; file: File; url: string } | { state: 'failed' };

/**
 * A shared image made ahead of the tap (H63): on opening and on each change
 * of range or switch, the records redacted, my photos inlined, the page
 * drawn offscreen and captured. Share then hands over a file that already
 * exists. A later choice outruns an earlier one: only the newest is kept.
 */
export function useShareImage({
  cards,
  today,
  span,
  faces,
}: {
  cards: Card[];
  today: IsoDate;
  span: ShareSpan;
  faces: boolean;
}): {
  range: ShareRange;
  redacted: Redacted;
  /** The photos the page draws, once inlined: the page waits for them. */
  photos: SignedMedia | null;
  image: ShareImage;
  onSettled: (root: HTMLElement) => void;
} {
  const range = useMemo(() => shareRange(span, today), [span, today]);
  const redacted = useMemo(
    () => redactForExport(inRange(cards, range), { faces }),
    [cards, range, faces],
  );
  const choice = `${range.span}:${range.first}:${faces}`;

  const [photos, setPhotos] = useState<{ choice: string; media: SignedMedia } | null>(null);
  useEffect(() => {
    let live = true;
    loadExportPhotos(redacted.cards)
      .then((media) => live && setPhotos({ choice, media }))
      // A photo that could not be had is a placeholder; the page still draws.
      .catch(() => live && setPhotos({ choice, media: {} }));
    return () => {
      live = false;
    };
  }, [redacted, choice]);

  const [image, setImage] = useState<{ choice: string; image: ShareImage } | null>(null);
  const seq = useRef(0);
  const onSettled = useCallback(
    (root: HTMLElement): void => {
      const mine = ++seq.current;
      captureExport(root)
        .then((blob) => {
          if (mine !== seq.current) return;
          const file = new File([blob], exportFileName(range), { type: 'image/png' });
          setImage({ choice, image: { state: 'ready', file, url: URL.createObjectURL(file) } });
        })
        .catch((error: unknown) => {
          if (mine !== seq.current) return;
          console.error('[during] share image not drawn', error);
          setImage({ choice, image: { state: 'failed' } });
        });
    },
    [choice, range],
  );

  // A preview's URL goes with the file it showed.
  const url = image?.image.state === 'ready' ? image.image.url : null;
  useEffect(() => (url ? () => URL.revokeObjectURL(url) : undefined), [url]);

  return {
    range,
    redacted,
    photos: photos?.choice === choice ? photos.media : null,
    image: image?.choice === choice ? image.image : { state: 'drawing' },
    onSettled,
  };
}
