'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/** Older than this, a place drawn from the router's cache is read again behind it. */
const STALE_MS = 5_000;
/** One read behind per arrival: a splash's own URL draws Home and the post together. */
let lastRefresh = 0;

/**
 * Stale while revalidate for a place or a post (review): a switch draws the
 * copy already in the browser at once (a prefetch, or a visit within
 * next.config's staleTimes); if that
 * copy was rendered a while ago, the place is read again in a transition and
 * merged in, the screen's own state kept. A fresh render (a first load, or
 * the refresh itself) is left alone, so this never loops.
 */
export function FreshOnArrival({ renderedAt }: { renderedAt: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (Date.now() - renderedAt < STALE_MS || Date.now() - lastRefresh < 1_000) return;
    lastRefresh = Date.now();
    startTransition(() => router.refresh());
  }, [renderedAt, router]);
  return null;
}
