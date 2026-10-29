'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';

import { sentryOptions } from '@/lib/observability';
import { BLANK_MS, blankReport, type Navigation, type Recovery } from '@/lib/watchdog';

import { useNavigationTrail } from './navigation-trail';

/** Reported to Sentry where it is on; a local run says so in the console. */
function report(trail: Navigation, blankMs: number, recovery: Recovery): void {
  const { message, tags, contexts, fingerprint } = blankReport(
    trail,
    blankMs,
    Date.now(),
    recovery,
  );
  const options = sentryOptions(
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  );
  if (!options.enabled) {
    console.warn(`[watchdog] ${message} at ${tags.route} (${recovery})`);
    return;
  }
  Sentry.captureMessage(message, { level: 'error', tags, contexts, fingerprint });
}

/**
 * The shell's page area, watched (2026-10-29): every page under the shell
 * draws something there — a board, a skeleton, an empty state — so an area
 * holding nothing for BLANK_MS is a blank page, which once stayed until a
 * reload (e2e/fast-switch.spec.ts). It is reported, read again once, and if
 * that brings nothing back, Reload is offered instead of a white screen.
 */
export function PageSlot({ children }: { children: ReactNode }) {
  const slot = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const trail = useNavigationTrail();
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const area = slot.current;
    if (!area) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let since = 0;
    let refreshed = false;
    const blank = (): void => {
      timer = null;
      if (area.childElementCount > 0) return;
      if (!refreshed) {
        report(trail.current, Date.now() - since, 'refresh');
        refreshed = true;
        // A recovery, not a write's second render (CLAUDE.md, one write one
        // render): the whole tree read again from the server, every cache
        // passed by.
        router.refresh();
        timer = setTimeout(blank, BLANK_MS);
        return;
      }
      report(trail.current, Date.now() - since, 'reload');
      setLost(true);
    };
    const look = (): void => {
      if (area.childElementCount > 0) {
        if (timer) clearTimeout(timer);
        timer = null;
        refreshed = false;
        setLost(false);
        return;
      }
      if (timer) return;
      since = Date.now();
      timer = setTimeout(blank, BLANK_MS);
    };
    const watcher = new MutationObserver(look);
    watcher.observe(area, { childList: true });
    look();
    return () => {
      watcher.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [router, trail]);

  return (
    <>
      <div ref={slot} data-page-slot className="flex min-h-0 min-w-0 flex-1 flex-col">
        {children}
      </div>
      {lost ? (
        <div
          role="alert"
          data-page-lost
          className="text-ink fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white px-6 text-center"
        >
          <p className="text-sm">Something went wrong.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-main-900 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
          >
            Reload
          </button>
        </div>
      ) : null}
    </>
  );
}
