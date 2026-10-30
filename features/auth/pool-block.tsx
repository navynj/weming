'use client';

import { useMemo } from 'react';

import { placeCard, type GridColumn } from '@/features/home/grid';
import { LaneGrid } from '@/features/home/lane-grid';
import type { SplashSummary } from '@/features/splash/summary';
import type { IsoDate } from '@/lib/time';

export type SampleLane = { id: string; name: string; icon: string };
export type SampleSplash = { id: string; title: string; lane: string; day: IsoDate };

const NONE = (): void => {};

/**
 * The sign-in screen's pool block: "Pool your days." over a few lanes with
 * splashes on them, drawn by Home's own grid in its decorative mode, so the
 * picture is the app's and cannot drift from it. Nothing in it is tapped,
 * focused or read out but its line.
 */
export function PoolBlock({ lanes, splashes }: { lanes: SampleLane[]; splashes: SampleSplash[] }) {
  const { cards, columns, top, water } = useMemo(() => {
    // Pooled, so filled as Home fills a record with others in it (0033, H55),
    // each label one lane wide, as a person can set it, so none runs past the block.
    const cards = splashes.map((s) => ({
      ...placeCard(summaryOf(s), '', 'UTC'),
      together: true,
      layout: { label: { width: 1 } },
    }));
    return {
      cards,
      // No header links: a lane here is a picture of one.
      columns: lanes.map((l): GridColumn => ({ ...l, href: null })),
      top: splashes[0]?.day ?? '2026-10-12',
      // The newest is the solid mark; the rest read translucent, as on Home.
      water: new Set(splashes.slice(1).map((s) => s.id)),
    };
  }, [lanes, splashes]);

  return (
    <div data-pool-block className="bg-main-900 w-full overflow-hidden rounded-3xl">
      {/* The line set off as a white label on the water, its words blue (review). */}
      <p className="px-5 pt-5 pb-3 text-lg font-semibold">
        <span className="text-main-900 rounded-md bg-white px-2 py-0.5">Pool your days.</span>
      </p>
      <div className="flex h-64 flex-col">
        <LaneGrid
          decorative
          // Drawn as Home draws them now: labels, not the older marks.
          pieces
          cards={cards}
          categories={columns}
          today={top}
          ring={null}
          waterIds={water}
          initials={null}
          scrollToMonth={null}
          onPick={NONE}
        />
      </div>
    </div>
  );
}

/** A sample splash as the grid reads one: a one-day post on its lane. */
function summaryOf({ id, title, lane, day }: SampleSplash): SplashSummary {
  const at = `${day}T12:00:00.000Z`;
  return {
    id,
    title,
    ghostTitle: null,
    description: null,
    declaredLaneId: lane,
    icon: null,
    laneIds: [lane],
    declaredRange: null,
    range: null,
    count: 1,
    blocks: [],
    latestCreatedAt: at,
    writtenOn: day,
    ownPoolId: null,
    open: false,
    createdAt: at,
    pinnedAt: null,
    sessionId: null,
    orphan: false,
  };
}
