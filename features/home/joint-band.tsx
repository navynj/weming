'use client';

import { CommitRing } from '@/components/ui/waves';
import type { IsoDate } from '@/lib/time';
import { Avatar } from '@/features/people/avatar';

import { monthAbbrev, weekdayOf, type Branch, type Card } from './grid';

/** The band's height, a member's face on it, and how many faces before "+n". */
const BAND_PX = 44;
const FACE_PX = 26;
const MAX_FACES = 4;
const RING_PX = 96;

/**
 * A joint splash on the grid (H23; `_docs/mockups/pool-swimmers.png`): a
 * horizontal band across every column at its day — its icon, its title, a
 * translucent fill at the card's radius — and at its right end how many
 * ripples it holds and who wrote them, four faces then "+n" (review: no
 * branches; a ripple is never drawn on the grid, only counted).
 *
 * The band is the joint splash's mark (`data-mark`): the ring plays on it,
 * and a tap brings its card to the top.
 */
export function JointBand({
  card,
  day,
  label,
  icon,
  dived,
  ring,
  onPick,
}: {
  card: Card;
  day: IsoDate;
  /** The day's name on the rail, when no plain row above has named it. */
  label: { monthChanges: boolean } | null;
  icon: string | null;
  dived: boolean;
  ring: number | null;
  onPick: (id: string) => void;
}) {
  const title = card.splash.title.trim() || card.splash.ghostTitle || 'Untitled';
  const branches = card.branches ?? [];
  // Each writer once, in the order they first wrote.
  return (
    <>
      <Rail day={day} label={label} />
      <div
        data-joint-row={card.splash.id}
        className="relative flex items-center py-1.5 pr-3"
        style={{ gridColumn: '2 / -1' }}
      >
        <button
          type="button"
          data-mark={card.splash.id}
          data-joint-band={card.splash.id}
          data-dived={dived ? '' : undefined}
          data-ring={ring !== null ? '' : undefined}
          aria-label={title}
          onClick={() => onPick(card.splash.id)}
          // On top of the stack (review): white, its words in blue, as the
          // top card reads; otherwise the solid joint surface, sitting back.
          className={`flex w-full min-w-0 items-center gap-2.5 rounded-[28px] pr-4 pl-1.5 text-left ${
            dived ? 'bg-joint text-white opacity-70' : 'text-main-900 bg-white'
          }`}
          style={{ height: BAND_PX }}
        >
          <span className="relative flex shrink-0 items-center justify-center">
            {ring !== null ? (
              <span
                key={ring}
                aria-hidden
                data-commit-ripple
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-white"
              >
                <span className="flex shrink-0">
                  <CommitRing size={RING_PX} contentSize={32} gap={6} once />
                </span>
              </span>
            ) : null}
            <span
              aria-hidden
              className={`relative flex h-8 w-8 items-center justify-center rounded-full text-base/none ${
                dived ? 'bg-white/30' : 'bg-main-100/60'
              }`}
            >
              {icon}
            </span>
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
          <JointCount count={branches.length} on={dived ? 'water' : 'white'} />
          <JointFaces branches={branches} size={FACE_PX} on={dived ? 'water' : 'white'} />
        </button>
      </div>
    </>
  );
}

/** The rail beside a band: the day's name when nothing above named it, else blank. */
function Rail({ day, label }: { day: IsoDate; label: { monthChanges: boolean } | null }) {
  if (!label) return <div aria-hidden className="bg-main-900 sticky left-0 z-10" />;
  return (
    <div
      data-day-row={day}
      data-labelled=""
      className="bg-main-900 sticky left-0 z-10 flex flex-col justify-center gap-0.5 py-2 pr-2 pl-6 text-white/70"
    >
      {label.monthChanges ? (
        <span data-month-label className="text-[10px]/none font-medium text-white/50">
          {day.slice(0, 4)}
          <br />
          {monthAbbrev(day)}
        </span>
      ) : null}
      <span className="text-sm/none font-medium tabular-nums">{Number(day.slice(8, 10))}</span>
      <span className="text-[10px]/none font-medium text-white/50">{weekdayOf(day)}</span>
    </div>
  );
}

/** "3 ripples": how many a joint splash holds, on its band and its Date-view row. */
export function JointCount({
  count,
  on = 'water',
}: {
  count: number;
  /** The surface beneath: the joint surface on the water, or white on top of the stack. */
  on?: 'water' | 'white';
}) {
  return (
    <span
      data-joint-count
      className={`shrink-0 text-xs font-medium tabular-nums ${
        on === 'white' ? 'text-main-900/70' : 'text-white/70'
      }`}
    >
      {count === 1 ? '1 ripple' : `${count} ripples`}
    </span>
  );
}

/**
 * Who wrote a joint splash's ripples (review): each writer once, in the order
 * they first wrote, stacked, four faces then "+n". Solid discs, so a face
 * never shows the one beneath it.
 */
export function JointFaces({
  branches,
  size,
  on = 'water',
}: {
  branches: Branch[];
  size: number;
  /** The surface beneath, whose colour the faces' ring takes so it parts them unseen. */
  on?: 'water' | 'white';
}) {
  const writers = [
    ...new Map(branches.map((b) => [b.authorId ?? b.initials, b] as const)).values(),
  ];
  if (writers.length === 0) return null;
  const more = writers.length - MAX_FACES;
  return (
    <span data-joint-faces className="flex shrink-0 items-center">
      {writers.slice(0, MAX_FACES).map((writer, at) => (
        <Avatar
          key={writer.authorId ?? writer.initials}
          id={writer.authorId}
          initials={writer.initials}
          // The ring is the surface's own colour (JOINT_SURFACE): it parts
          // stacked faces without drawing a line (review).
          className={`text-main-900/60 bg-joint-face flex items-center justify-center rounded-full text-[10px] font-medium ring-2 ${
            on === 'white' ? 'ring-white' : 'ring-joint'
          } ${at > 0 ? '-ml-1' : ''}`}
          style={{ width: size, height: size }}
        />
      ))}
      {more > 0 ? (
        <span
          data-joint-more
          className={`ml-1 text-[10px] font-medium ${
            on === 'white' ? 'text-main-900/70' : 'text-white/70'
          }`}
        >
          +{more}
        </span>
      ) : null}
    </span>
  );
}
