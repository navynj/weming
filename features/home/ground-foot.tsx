'use client';

import { useRef, type ReactNode, useState } from 'react';
import Link from 'next/link';
import { Plus, Settings } from 'lucide-react';

import { Monogram } from '@/components/ui/monogram';
import { useAxisLock } from '@/components/ui/use-axis-lock';
import { initialsOf } from '@/features/home/grid';
import { Avatar } from '@/features/people/avatar';
import { ProfileSheet } from '@/features/people/profile-sheet';
import { usePeople } from '@/features/people/people-provider';
import { UnseenDot, useStripPools } from '@/features/pool/activity';

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
  const [settings, setSettings] = useState(false);

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
        {/* Settings first, before my face (0032): my photo, my name, my theme. */}
        <button
          type="button"
          aria-label="Settings"
          data-strip-settings
          onClick={() => setSettings(true)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80"
        >
          <Settings aria-hidden size={20} />
        </button>
        <Place
          current={atHome}
          label={atHome ? homeLabel : 'Home'}
          href="/"
          onTap={atHome ? onHome : undefined}
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
              href={`/pool/${pool.id}`}
              onTap={current ? onPool : undefined}
              dot={pool.fresh && !current}
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
        <Plus aria-hidden size={24} />
      </button>
      {settings ? <ProfileSheet onClose={() => setSettings(false)} /> : null}
    </div>
  );
}

/** One place on the strip: a link there, or — where I am — the view cycle. */
function Place({
  current,
  label,
  href,
  onTap,
  dot = false,
  shape,
  data,
  children,
}: {
  current: boolean;
  label?: string;
  href: string;
  onTap?: () => void;
  dot?: boolean;
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
  return (
    <Link href={href} aria-label={label} className={className} {...data}>
      {body}
    </Link>
  );
}
