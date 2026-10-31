'use client';

import { useEffect } from 'react';

import { AWAY_MS, takeOpenMarker } from '@/lib/app-opens';

import { recordReturn, recordOpen } from './record-open';

/** Once per page load, whatever remounts the shell. */
let loaded = false;

/**
 * Counts app opens (H71): the load, and each return to the front after
 * thirty minutes or more away. A load from a push's link counts as that
 * push's tap, and the marker leaves the address bar. Renders nothing.
 */
export function AppOpenLog(): null {
  useEffect(() => {
    if (!loaded) {
      loaded = true;
      const here = window.location.pathname + window.location.search + window.location.hash;
      const { path, notificationId } = takeOpenMarker(here);
      if (path !== here) window.history.replaceState(null, '', path);
      recordOpen(notificationId);
    }
    let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
    function onVisibility(): void {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= AWAY_MS) recordReturn();
      hiddenAt = null;
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  return null;
}
