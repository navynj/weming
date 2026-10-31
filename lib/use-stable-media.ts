'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';

import {
  cachedMediaUrl,
  mediaUrlsVersion,
  rememberMediaUrls,
  stableSignedUrl,
  subscribeMediaUrls,
} from '@/lib/media-url-cache';
import type { MediaVariant } from '@/lib/ripple-media';

const ON_SERVER = -1;

/**
 * URLs a server render signed, lined up with their paths, swapped for the
 * ones this browser already keeps (lib/media-url-cache.ts): a page another
 * server instance signed draws the URL whose bytes are already here. Paths
 * and URLs must be the same length, else the server's are drawn as they are.
 */
export function useStableMedia(
  variant: MediaVariant,
  paths: string[],
  urls: (string | null)[],
): (string | null)[] {
  const version = useSyncExternalStore(subscribeMediaUrls, mediaUrlsVersion, () => ON_SERVER);
  const aligned = paths.length === urls.length;
  const key = aligned ? JSON.stringify([paths, urls]) : '';

  useEffect(() => {
    if (!key) return;
    const [p, u] = JSON.parse(key) as [string[], (string | null)[]];
    // Only what was signed: a placeholder here says nothing about the next render.
    rememberMediaUrls(
      variant,
      Object.fromEntries(p.flatMap((path, i) => (u[i] ? [[path, u[i]]] : []))),
    );
  }, [variant, key]);

  return useMemo(() => {
    if (!key || version === ON_SERVER) return urls;
    const [p, u] = JSON.parse(key) as [string[], (string | null)[]];
    return p.map((path, i) => (u[i] ? (cachedMediaUrl(variant, path) ?? u[i]) : null));
    // `urls` is in `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, key, version]);
}

/**
 * One signed URL, swapped after hydration for the one this browser already
 * keeps for the same object and version (`stableSignedUrl`): a face another
 * server instance signed draws from the bytes already here. The server's
 * render, and the first client one, draw the URL as given.
 */
export function useStableUrl(url: string | null): string | null {
  const hydrated = useSyncExternalStore(subscribeMediaUrls, mediaUrlsVersion, () => ON_SERVER);
  return useMemo(
    () => (url && hydrated !== ON_SERVER ? stableSignedUrl(url) : url),
    [url, hydrated],
  );
}
