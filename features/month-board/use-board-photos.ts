'use client';

import { useEffect, useMemo, useState } from 'react';

import { signBoardPhotos, type SignedMedia } from '@/lib/media';
import { isVideoPath, videoIdOf } from '@/lib/ripple-media';
import { thumbnailUrl } from '@/lib/youtube';

import type { BoardPiece } from './layout';

/**
 * Photos signed once they are shown: keyed by path, absent while asking,
 * `null` for one that could not be signed (its placeholder stays; nothing
 * waits on a photo).
 */
export function useSignedPhotos(refs: { rippleId: string; path: string }[]): SignedMedia {
  const key = JSON.stringify([...refs].sort((a, b) => a.path.localeCompare(b.path)));
  const [signed, setSigned] = useState<SignedMedia>({});
  // A video's thumbnail needs no signing (part 5): YouTube's own, fetched
  // only where it is drawn.
  const videos = useMemo(() => {
    const refsNow = JSON.parse(key) as { path: string }[];
    return Object.fromEntries(
      refsNow
        .filter((r) => isVideoPath(r.path))
        .map((r) => [r.path, thumbnailUrl(videoIdOf(r.path))]),
    );
  }, [key]);
  useEffect(() => {
    const photos = (JSON.parse(key) as { rippleId: string; path: string }[]).filter(
      (p) => !isVideoPath(p.path),
    );
    if (photos.length === 0) return;
    let live = true;
    // A call that fails on the way (a timeout, a deploy) leaves placeholders.
    signBoardPhotos(photos)
      .then((urls) => {
        if (live) setSigned((current) => ({ ...current, ...urls }));
      })
      .catch((error: unknown) => console.error('[during] board photos not signed', error));
    return () => {
      live = false;
    };
  }, [key]);
  return useMemo(() => ({ ...signed, ...videos }), [signed, videos]);
}

/** The month's thumbnails, signed once the board shows them. */
export function useBoardPhotos(pieces: BoardPiece[]): SignedMedia {
  const wanted = useMemo(
    () => pieces.flatMap((p) => p.fan.map(({ rippleId, path }) => ({ rippleId, path }))),
    [pieces],
  );
  return useSignedPhotos(wanted);
}
