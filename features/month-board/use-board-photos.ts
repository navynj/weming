'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';

import type { SignedMedia } from '@/lib/media';
import {
  cachedMediaUrl,
  isRefusedMedia,
  mediaUrlsVersion,
  requestMediaUrls,
  subscribeMediaUrls,
} from '@/lib/media-url-cache';
import { appAssetUrl, isAppAsset, isVideoPath, videoIdOf } from '@/lib/ripple-media';
import { thumbnailUrl } from '@/lib/youtube';

import type { BoardPiece } from './layout';

/** The server's render knows no browser cache: it draws placeholders, as before. */
const ON_SERVER = -1;

/**
 * Photos signed once they are shown, as thumbnails: keyed by path, absent
 * while asking, `null` for one that could not be signed (its placeholder
 * stays; nothing waits on a photo). A path signed before — by this card,
 * another, or an earlier visit — is drawn from its kept URL at once
 * (lib/media-url-cache.ts), so the browser's copy answers and nothing is
 * fetched again; only the rest are asked for, in one call with every other
 * list's.
 */
export function useSignedPhotos(refs: { rippleId: string; path: string }[]): SignedMedia {
  const key = JSON.stringify([...refs].sort((a, b) => a.path.localeCompare(b.path)));
  const version = useSyncExternalStore(subscribeMediaUrls, mediaUrlsVersion, () => ON_SERVER);
  // A video's thumbnail needs no signing (part 5): YouTube's own, fetched
  // only where it is drawn. Nor does a photo the app ships (H58): same
  // origin, so it asks the server nothing, signed in or out.
  const unsigned = useMemo(() => {
    const refsNow = JSON.parse(key) as { path: string }[];
    return Object.fromEntries(
      refsNow.flatMap((r) =>
        isVideoPath(r.path)
          ? [[r.path, thumbnailUrl(videoIdOf(r.path))]]
          : isAppAsset(r.path)
            ? [[r.path, appAssetUrl(r.path)]]
            : [],
      ),
    );
  }, [key]);
  const signed = useMemo((): SignedMedia => {
    if (version === ON_SERVER) return {};
    const refsNow = JSON.parse(key) as { path: string }[];
    return Object.fromEntries(
      refsNow.flatMap((r): [string, string | null][] => {
        if (isVideoPath(r.path) || isAppAsset(r.path)) return [];
        const url = cachedMediaUrl('thumb', r.path);
        if (url) return [[r.path, url]];
        return isRefusedMedia('thumb', r.path) ? [[r.path, null]] : [];
      }),
    );
  }, [key, version]);
  useEffect(() => {
    const photos = (JSON.parse(key) as { rippleId: string; path: string }[]).filter(
      (p) => !isVideoPath(p.path) && !isAppAsset(p.path),
    );
    if (photos.length > 0) requestMediaUrls('thumb', photos);
  }, [key]);
  return useMemo(() => ({ ...signed, ...unsigned }), [signed, unsigned]);
}

/** The month's thumbnails, signed once the board shows them. */
export function useBoardPhotos(pieces: BoardPiece[]): SignedMedia {
  const wanted = useMemo(
    () => pieces.flatMap((p) => p.fan.map(({ rippleId, path }) => ({ rippleId, path }))),
    [pieces],
  );
  return useSignedPhotos(wanted);
}
