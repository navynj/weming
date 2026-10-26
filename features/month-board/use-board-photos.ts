'use client';

import { useEffect, useMemo, useState } from 'react';

import { signBoardPhotos, type SignedMedia } from '@/lib/media';

import type { BoardPiece } from './layout';

/**
 * The month's thumbnails, signed once the board shows them: keyed by path,
 * absent while asking, `null` for one that could not be signed (its
 * placeholder stays; the board never waits on a photo).
 */
export function useBoardPhotos(pieces: BoardPiece[]): SignedMedia {
  const wanted = useMemo(
    () =>
      pieces
        .flatMap((p) => p.fan.map(({ rippleId, path }) => ({ rippleId, path })))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [pieces],
  );
  const key = JSON.stringify(wanted);
  const [signed, setSigned] = useState<SignedMedia>({});
  useEffect(() => {
    const photos = JSON.parse(key) as { rippleId: string; path: string }[];
    if (photos.length === 0) return;
    let live = true;
    void signBoardPhotos(photos).then((urls) => {
      if (live) setSigned((current) => ({ ...current, ...urls }));
    });
    return () => {
      live = false;
    };
  }, [key]);
  return signed;
}
