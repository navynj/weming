'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';

import { OpeningContext, type OpeningHeader, type Openings } from './opening-context';
import { DETAIL_TITLE_CLASS } from './splash-header';
import { SplashModal } from './splash-modal';

type Opening = OpeningHeader & {
  /** The route's path, no hash: the sheet that lands there adopts this one. */
  path: string;
  at: number;
  /** Closed before its page arrived: the page, landing, closes itself. */
  dismissed: boolean;
};

/** A dismissed opening is forgotten after this, so a later visit opens normally. */
const DISMISSED_FOR_MS = 15_000;

/** Headers of the records the bell listed, for a push that opens one while the app is up. */
const known = new Map<string, OpeningHeader>();

export function rememberHeader(path: string, header: OpeningHeader): void {
  known.set(pathOf(path), header);
}

function pathOf(url: string): string {
  return url.split('#')[0].split('?')[0];
}

/** Only a record's own URL opens as a sheet: a pool's splash or Home's. */
function isRecord(path: string): boolean {
  return /^\/(pool\/[^/]+\/)?splash\/[^/]+$/.test(path);
}

/**
 * Opening a record from a notification, at once (review): the sheet rises on
 * the tap with the title and icon the notification carries and a still
 * skeleton below, while its page is fetched; the routed sheet, landing,
 * takes its place in the same frame with no second rise, and scrolls to the
 * reply or block. Never a moment with no sheet.
 */
export function SplashOpeningProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [opening, setOpening] = useState<Opening | null>(null);
  const current = useRef<Opening | null>(null);
  // Set when the routed sheet takes over: the opening one leaves without an exit.
  const handedOff = useRef(false);

  const show = useCallback((next: Opening | null) => {
    current.current = next;
    setOpening(next);
  }, []);

  const open = useCallback(
    (url: string, header?: OpeningHeader | null) => {
      const path = pathOf(url);
      if (isRecord(path) && path !== pathname) {
        handedOff.current = false;
        show({
          ...(header ?? known.get(path) ?? { title: null, icon: null, poolName: null }),
          path,
          at: Date.now(),
          dismissed: false,
        });
      }
      router.push(url);
    },
    [pathname, router, show],
  );

  const value = useMemo<Openings>(
    () => ({
      open,
      prefetch: (url) => router.prefetch(pathOf(url), { kind: 'full' as PrefetchKind }),
      peek: (path) => {
        const at = current.current;
        if (!at || at.path !== path) return null;
        if (!at.dismissed) return 'adopt';
        return Date.now() - at.at < DISMISSED_FOR_MS ? 'dismissed' : null;
      },
      settle: () => {
        if (!current.current) return;
        handedOff.current = true;
        show(null);
      },
    }),
    [open, router, show],
  );

  const sheet =
    opening && !opening.dismissed ? (
      <SplashModal
        key={opening.path}
        closeTo={null}
        // Closed before its page came: it is remembered, so the page closes on landing.
        onLeave={() => {
          const at = current.current;
          if (at) show({ ...at, dismissed: true });
        }}
        silentExit={() => handedOff.current}
      >
        <OpeningSkeleton header={opening} />
      </SplashModal>
    ) : null;

  return (
    <OpeningContext.Provider value={value}>
      <OpeningSheet.Provider value={sheet}>{children}</OpeningSheet.Provider>
    </OpeningContext.Provider>
  );
}

// The sheet is held here and drawn by the host, beside the routed sheet and
// inside the providers a sheet needs (the composer's, for one).
const OpeningSheet = createContext<ReactNode>(null);

/** Where the opening sheet is drawn: beside the shell's modal slot. */
export function SplashOpeningHost() {
  return useContext(OpeningSheet);
}

/**
 * The page before it arrives: the header from the notification, then still
 * shapes for the description, the blocks and a photo. Nothing in it moves
 * (SPEC 7, law 1: only living things move).
 */
function OpeningSkeleton({ header }: { header: OpeningHeader }) {
  const bar = 'bg-pool-100 block rounded-full';
  return (
    <div
      data-splash-opening
      aria-busy="true"
      className="flex flex-1 flex-col bg-white pt-1 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-16"
    >
      <div data-splash-side className="flex flex-col lg:sticky lg:top-0 lg:pt-3">
        <header className="flex flex-col gap-2 pb-6">
          <span className="flex min-h-8 items-center">
            {header.poolName ? (
              <span className="text-pool-500 text-xs">{header.poolName}</span>
            ) : null}
          </span>
          <div className="flex items-start gap-3">
            {header.icon ? (
              <span aria-hidden className="text-3xl/none">
                {header.icon}
              </span>
            ) : null}
            <h1 data-opening-title className={`text-ink min-w-0 flex-1 ${DETAIL_TITLE_CLASS}`}>
              {header.title?.trim() ? (
                header.title
              ) : (
                <span aria-label="Loading" className={`${bar} mt-2 h-7 w-48`} />
              )}
            </h1>
          </div>
        </header>
        <span className={`${bar} mb-2 h-3 w-full`} />
        <span className={`${bar} mb-6 h-3 w-2/3`} />
      </div>
      <div data-splash-skeleton className="flex flex-col gap-6 lg:pt-3">
        {[0, 1].map((n) => (
          <div key={n} className="flex flex-col gap-2">
            <span className={`${bar} h-3 w-24`} />
            <span className={`${bar} h-3 w-full`} />
            <span className={`${bar} h-3 w-5/6`} />
          </div>
        ))}
        <span className="bg-pool-100 block aspect-[4/3] w-full rounded-2xl" />
      </div>
    </div>
  );
}
