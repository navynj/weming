'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/** Older than this, a place drawn from the router's cache is read again behind it. */
const STALE_MS = 5_000;

/**
 * Stale while revalidate for a place (review): the strip prefetches every
 * place, so a switch draws the copy already in the browser at once; if that
 * copy was rendered a while ago, the place is read again in a transition and
 * merged in, the screen's own state kept. A fresh render (a first load, or
 * the refresh itself) is left alone, so this never loops.
 */
export function FreshOnArrival({ renderedAt }: { renderedAt: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (Date.now() - renderedAt < STALE_MS) return;
    startTransition(() => router.refresh());
  }, [renderedAt, router]);
  return null;
}
