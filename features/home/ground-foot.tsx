'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';

import { Monogram } from '@/components/ui/monogram';
import { useAxisLock } from '@/components/ui/use-axis-lock';
import { initialsOf } from '@/features/home/grid';
import { Avatar } from '@/features/people/avatar';
import { usePeople } from '@/features/people/people-provider';
import { UnseenDot, useStripPools } from '@/features/pool/activity';

import { PendingPlace } from './ground-skeleton';
import { placesToWarm, recentPlaces, rememberPlace } from './recent-places';
import { poolPath } from '@/lib/routes';

type Router = ReturnType<typeof useRouter>;
type PrefetchKind = NonNullable<Parameters<Router['prefetch']>[1]>['kind'];
/** `PrefetchKind.FULL`: a dynamic page with its data, not just down to its loading boundary. Next exports the enum only as a type. */
const FULL = 'full' as PrefetchKind;

/**
 * A place is prefetched in full at most once in this long. Next calls a
 * prefetch's onInvalidate whenever its entry is replaced — by another
 * prefetch of the same place, or any action's revalidation — and answering
 * each call at once with a new prefetch looped: opening Home with six pools
 * sent over a thousand renders in twelve seconds (2026-10-28).
 */
const WARM_MS = 30_000;
const warmedAt = new Map<string, number>();

/** A full prefetch of `href`, unless one went out within WARM_MS; then the time left. */
function prefetchFull(router: Router, href: string, onInvalidate?: () => void): number {
  const left = (warmedAt.get(href) ?? -Infinity) + WARM_MS - Date.now();
  if (left > 0) return left;
  warmedAt.set(href, Date.now());
  router.prefetch(href, { kind: FULL, onInvalidate });
  return 0;
}

/**
 * The ground's foot (review): the places I go, as a strip — my face first
 * (Home), then a monogram per pool I am in, the one I opened last first, then
 * a small `+` to open a new pool — and compose at the right as the white disc
 * with the blue plus, outside the strip. I am a circle and a pool a rounded
 * square, so a pool never reads as a person (review). The place I am in wears
 * a white border; the others sit back, faded — the image only, so a pool's
 * dot for something new since my last visit stays at full strength. Tapping a place goes there; tapping the one
 * I am in walks its views (Home: Lane ↔ Date; a pool: Members → Lane →
 * Date). The strip scrolls sideways, one axis per gesture.
 *
 * Two slots, CSS showing one per breakpoint so nothing moves after load: on
 * a phone a row at the foot of the board; on a wide screen a vertical rail at
 * the ground's right edge, the same places in the same order, then compose.
 */
export function GroundFoot({
  slot = 'phone',
  here,
  poolId = null,
  onHome,
  onPool,
  onCompose,
  homeLabel,
  poolLabel,
}: {
  slot?: 'phone' | 'wide';
  /** Where I am: Home, or a pool — `poolId` names which (none on the pool index). */
  here: 'home' | 'pool';
  poolId?: string | null;
  /** Home's own tap, when Home is where we are: the view switch. */
  onHome?: () => void;
  onCompose: () => void;
  /** Home's accessible name, which says what a tap will do. */
  homeLabel?: string;
  /** The current pool's own tap: the view cycle (review). */
  onPool?: () => void;
  poolLabel?: string;
}) {
  const wide = slot === 'wide';
  const strip = useRef<HTMLElement>(null);
  useAxisLock(strip);
  const { me, people } = usePeople();
  const pools = useStripPools();
  const myName = me ? (people[me]?.name ?? '') : '';
  const atHome = here === 'home';
  // In full, only the two places I went to last (not every place: the
  // storm): a switch to either draws from the router's cache, and
  // FreshOnArrival reads it again behind. Kept warm when an action
  // invalidates them, at most once in WARM_MS each. Every other place is
  // prefetched when the hand reaches for it (Place). One slot is enough;
  // the other is the same places.
  const router = useRouter();
  const place = atHome ? '/' : poolId ? poolPath(poolId) : null;
  const hrefs = ['/', ...pools.map((pool) => poolPath(pool.id))].join(' ');
  useEffect(() => {
    if (wide) return;
    if (place) rememberPlace(place);
    let live = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const warm = (href: string): void => {
      if (!live) return;
      const left = prefetchFull(router, href, () => warm(href));
      if (left > 0) timers.add(setTimeout(() => warm(href), left));
    };
    placesToWarm(place, hrefs.split(' '), recentPlaces()).forEach(warm);
    return () => {
      live = false;
      timers.forEach(clearTimeout);
    };
  }, [place, hrefs, router, wide]);
  const reach = (href: string): void => void prefetchFull(router, href);

  return (
    <div
      data-home-foot={slot}
      className={
        wide
          ? 'hidden min-h-0 shrink-0 flex-col items-center justify-center gap-6 self-stretch py-6 pr-6 lg:flex'
          : 'flex shrink-0 items-center gap-3 pt-2 pr-6 pl-4 lg:hidden'
      }
      style={
        wide ? undefined : { paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }
      }
    >
      <nav
        ref={strip}
        aria-label="Places"
        data-place-strip
        className={`no-scrollbar flex items-center gap-3 ${
          wide ? 'min-h-0 flex-col overflow-y-auto p-1.5' : 'min-w-0 flex-1 overflow-x-auto p-1.5'
        }`}
      >
        <Place
          current={atHome}
          label={atHome ? homeLabel : 'Home'}
          href="/"
          onTap={atHome ? onHome : undefined}
          onReach={reach}
          pending={<PendingPlace here="home" />}
          shape="circle"
          data={{ 'data-home-tab': '', 'data-strip-home': '' }}
        >
          <Avatar
            id={me}
            initials={initialsOf(myName)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/25 text-xs font-medium text-white"
          />
        </Place>
        {pools.map((pool) => {
          const current = here === 'pool' && pool.id === poolId;
          return (
            <Place
              key={pool.id}
              current={current}
              label={current ? (poolLabel ?? pool.name) : pool.name}
              href={poolPath(pool.id)}
              onTap={current ? onPool : undefined}
              onReach={reach}
              dot={pool.fresh && !current}
              pending={<PendingPlace here="pool" poolId={pool.id} />}
              shape="square"
              data={{
                'data-strip-pool': pool.id,
                ...(current ? { 'data-pool-tab': '' } : {}),
              }}
            >
              <Monogram name={pool.name} size="nav" photo={pool.photo} />
            </Place>
          );
        })}
        <Link
          href="/pool/new"
          aria-label="Open a new Pool"
          data-strip-new
          // A pool to be: the pools' rounded square, dashed (review).
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/40 text-white/80"
        >
          <Plus aria-hidden size={18} />
        </Link>
      </nav>
      <button
        type="button"
        aria-label="Drop a splash"
        data-compose
        onClick={onCompose}
        className="text-main-900 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white"
      >
        <Pencil aria-hidden size={22} />
      </button>
    </div>
  );
}

/** One place on the strip: a link there, or — where I am — the view cycle. */
function Place({
  current,
  label,
  href,
  onTap,
  onReach,
  dot = false,
  pending,
  shape,
  data,
  children,
}: {
  current: boolean;
  label?: string;
  href: string;
  onTap?: () => void;
  /** The hand reaching for it — a press or a hover: prefetch it in full now. */
  onReach: (href: string) => void;
  dot?: boolean;
  /** Drawn inside the link, so it can read whether a tap on it is waiting. */
  pending?: ReactNode;
  /** A person is a circle, a pool a rounded square (review). */
  shape: 'circle' | 'square';
  data: Record<string, string>;
  children: ReactNode;
}) {
  // On the strip the place I am in wears a white border (review: white on
  // the water, not ink); the rest are faded, the image only.
  const round = shape === 'circle' ? 'rounded-full' : 'rounded-lg';
  const className = `relative flex shrink-0 ${round} ${current ? 'ring-[3px] ring-white' : ''}`;
  const body = (
    <>
      <span data-place-image className={`flex ${current ? '' : 'opacity-50'}`}>
        {children}
      </span>
      {dot ? <UnseenDot label="New here" /> : null}
    </>
  );
  if (current) {
    return (
      <button
        type="button"
        aria-current="page"
        aria-label={label}
        data-strip-current=""
        onClick={onTap}
        className={className}
        {...data}
      >
        {body}
      </button>
    );
  }
  const reach = (): void => onReach(href);
  return (
    // Never on sight (the storm): in full when the hand reaches for it, the
    // place's data with it, or ahead of time if it is one of the last two.
    <Link
      href={href}
      prefetch={false}
      onPointerDown={reach}
      onTouchStart={reach}
      onMouseEnter={reach}
      aria-label={label}
      className={className}
      {...data}
    >
      {body}
      {pending}
    </Link>
  );
}
