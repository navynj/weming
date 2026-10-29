'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { usePathname } from 'next/navigation';

import { scrubName } from '@/lib/observability';
import type { Navigation } from '@/lib/watchdog';

/**
 * Where I am and where I came from, as route patterns (scrubName), for what
 * the watchdog reports (lib/watchdog.ts). A ref, so reading it never renders;
 * `onMove` runs after each navigation, with the trail already moved on.
 */
export function useNavigationTrail(onMove?: () => void): RefObject<Navigation> {
  const pathname = usePathname();
  const trail = useRef<Navigation>({ route: '', from: null, at: null });
  const moved = useRef(onMove);
  useEffect(() => {
    moved.current = onMove;
  });
  useEffect(() => {
    const route = scrubName(pathname);
    const before = trail.current;
    trail.current =
      before.route === ''
        ? { route, from: null, at: null }
        : { route, from: before.route, at: Date.now() };
    moved.current?.();
  }, [pathname]);
  return trail;
}
