'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Bubbles, ChevronDown, Plus, Undo2 } from 'lucide-react';

import { DEEP_SCALE, WaveLine } from '@/components/ui/waves';
import { StopControl } from '@/features/home-daily/stop-control';
import { formatStopwatch, useElapsedSeconds } from '@/features/home-daily/use-elapsed';
import { InputSheet, type SheetContext } from '@/features/input-sheet/input-sheet';
import type { RippleWithSplash } from '@/lib/queries/ripples';

import { endBreak, startBreak } from './break';

/**
 * DORMANT (H20b). The running-record focus screen has no route and no entry
 * point since the Splash pivot; it stays, with its tests, for P3's Swim.
 */
/**
 * H15a: a running timed, at full size. A solid #0507C9 surface — which law 5
 * now reads as "a live session" — with the elapsed time at display size and
 * slow white water crossing it at the deep preset, because at full width the
 * timeline's geometry read flat.
 *
 * Absent on purpose, and not to be added back without revisiting H15: no goal
 * duration, no percent, no progress bar (gauges and targets, rejected by F2
 * and the no-guilt hypothesis); no pause — Break records the rest instead,
 * and the session's clock never stops (H15a2).
 *
 * Type sizes and the control row are eyed from _docs/mockups/timer-focus.png,
 * not exported.
 */
export function FocusScreen({
  ripple,
  startedAt,
  initialSeconds,
  openBreak,
  breakStartedAt,
  breakInitialSeconds,
  sheetContext,
}: {
  ripple: RippleWithSplash;
  startedAt: string;
  initialSeconds: number;
  /** The break running inside this session, if one is (H15a2). */
  openBreak?: string | null;
  breakStartedAt?: string | null;
  breakInitialSeconds?: number;
  /** Lets the sheet open over this surface instead of navigating away. */
  sheetContext?: SheetContext;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addingInner, setAddingInner] = useState(false);
  const seconds = useElapsedSeconds(startedAt, initialSeconds);
  // A ripple has no lane of its own since 0042 (H24): the session's name.
  const category = 'Focus';
  const onBreak = Boolean(openBreak);

  return (
    <main className="live-surface flex min-h-dvh flex-col px-6 py-5">
      <header className="flex items-start justify-between gap-4">
        <Link href="/" className="flex items-center gap-1 text-sm text-white/80">
          <ChevronDown aria-hidden size={16} />
          Collapse
        </Link>

        <span className="flex max-w-[60%] items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm text-white">
          <span className="truncate">
            {category}
            {ripple.note ? ` · ${ripple.note}` : ''}
          </span>
        </span>
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center">
        {/* Law 2: rest is the same channel at its low value, so on a break the
            water stops moving rather than turning into something else. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 flex flex-col gap-12 opacity-40"
        >
          <FullWidthWave still={onBreak} />
          <FullWidthWave still={onBreak} />
          <FullWidthWave still={onBreak} />
        </div>

        <p className="relative text-xs tracking-[0.35em] text-white/70 uppercase">{category}</p>
        <p className="relative text-7xl font-light text-white tabular-nums">
          {formatStopwatch(seconds)}
        </p>

        {/* Beside the session's clock, never subtracted from it: the session
            keeps gross wall-clock time and no net figure is shown (H15a2). */}
        {onBreak && breakStartedAt ? (
          <BreakClock since={breakStartedAt} initialSeconds={breakInitialSeconds ?? 0} />
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-8 pb-4">
        {/* Bubbles: exhaled air underwater — resting while submerged, which is
            the surface's own metaphor and the Submerge vocabulary. Resume
            turns back from it. Never a pause glyph, which would promise the
            clock stops, and never a droplet, which is already a drop. */}
        <SideAction
          label={onBreak ? 'Resume' : 'Break'}
          icon={onBreak ? <Undo2 aria-hidden size={18} /> : <Bubbles aria-hidden size={18} />}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              if (onBreak && openBreak) await endBreak(openBreak);
              else await startBreak(ripple.id);
              router.refresh();
            })
          }
        />

        <StopControl
          rippleId={ripple.id}
          since={startedAt}
          initialMinutes={Math.round(seconds / 60)}
          tone="on-live"
          variant="primary"
          openBreakId={openBreak ?? null}
          onStopped={() => router.push('/')}
        />

        <SideAction
          label="Add"
          title="Add to this session"
          icon={<Plus aria-hidden size={18} />}
          onClick={() => setAddingInner(true)}
        />
      </div>

      {/* The sheet opens over the surface rather than navigating to it: this
          screen never unmounts, so the water behind the scrim keeps moving. */}
      {/* DORMANT (H20b): inner composition has no prefill any more; the sheet
          opens plain here until P3's Swim gives a session a way in again. */}
      {addingInner && sheetContext ? (
        <InputSheet
          context={sheetContext}
          prefill={{}}
          onClose={() => setAddingInner(false)}
          onCommitted={() => {
            setAddingInner(false);
            router.refresh();
          }}
        />
      ) : null}
    </main>
  );
}

/**
 * One wave line stretched across the surface, at the deep preset: the same
 * curve enlarged, not a second shape.
 */
function FullWidthWave({ still = false }: { still?: boolean }) {
  return (
    <span className="flex justify-center overflow-hidden">
      <WaveLine width={440} travelling={!still} scale={DEEP_SCALE} />
    </span>
  );
}

/** How long the break has run. Beside the session's clock, never subtracted. */
function BreakClock({ since, initialSeconds }: { since: string; initialSeconds: number }) {
  const seconds = useElapsedSeconds(since, initialSeconds);
  return (
    <p className="relative mt-3 rounded-full bg-white/15 px-3 py-1 text-sm text-white">
      On a break · {formatStopwatch(seconds)}
    </p>
  );
}

function SideAction({
  label,
  title,
  icon,
  disabled = false,
  onClick,
}: {
  label: string;
  title?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={title ?? label}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-full border border-white/40 text-[11px] font-medium text-white disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}
