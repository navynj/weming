'use client';

import { useState, type ReactNode } from 'react';

import { LaneChips } from '@/features/input-sheet/lane-chips';
import { usePeople } from '@/features/people/people-provider';
import {
  defaultAudience,
  preselectLane,
  withPick,
  type AudiencePick,
} from '@/features/pool/audience';
import { AudienceChip } from '@/features/pool/audience-sheet';
import type { PoolScope } from '@/features/pool/compose-scope';
import { lastPicked, rememberPick } from '@/features/pool/last-pick';
import { PoolLanePicker } from '@/features/pool/pool-lane-picker';
import type { Together } from '@/features/pool/pool-pick';

import {
  homeWarnings,
  planFromHome,
  planFromPool,
  removedFrom,
  type Conversion,
  type Current,
} from './conversion';
import type { SplashEditState } from './edit-actions';
import type { SheetContext } from './splash-sheet';

type Loaded = Extract<SplashEditState, { ok: true }>;

export type EditLanes = {
  conversion: Conversion;
  /** Mine from Home: the lane chosen (its declaration). */
  laneId: string | null;
  /** Mine from Home: the Audience as set, a pool lane per pool. */
  shared: AudiencePick[];
  /** A joint record: the members added in Together (0033), and Everyone turned on. */
  invite: string[];
  inviteEveryone: boolean;
  changed: boolean;
  /** Becoming joint asks first (review): the pool, and the other pools it leaves. */
  confirm: { pool: string; removed: string[] } | null;
  node: ReactNode;
};

/**
 * The edit sheet's lanes (0022, 0033). Opened from a pool the record is in:
 * that pool's lane chips; With only on a joint record, to add people — my
 * own record never becomes joint here (the menu's "Make it a joint record
 * of…" does that), and nothing becomes mine there. Opened
 * from Home: my lanes — with the Audience for my Home record; for a pool or
 * joint record only I wrote in, picking a lane makes it mine, its Audience
 * set anew as a new record's; a joint record someone else wrote in keeps to
 * its pool's lanes.
 */
export function useEditLanes(
  initial: Loaded,
  context: SheetContext,
  pool: PoolScope | null,
): EditLanes {
  const { categories, links, pools } = context;
  const { me } = usePeople();
  const poolName = (id: string): string => pools.find((p) => p.id === id)?.name ?? 'its Pool';
  const current: Current = {
    kind: initial.kind,
    poolLaneId: initial.poolLaneId,
    declaredLaneId: initial.declaredLaneId,
    sharedIn: initial.sharedIn,
  };
  const inPool =
    pool !== null &&
    (initial.poolId === pool.poolId || initial.sharedIn.some((s) => s.poolId === pool.poolId));
  const hereLane = pool
    ? initial.kind === 'mine'
      ? (initial.sharedIn.find((s) => s.poolId === pool.poolId)?.poolLaneId ?? null)
      : initial.poolLaneId
    : null;

  // From a pool: the chosen pool lane and Together.
  const [chosenLane, setChosenLane] = useState<string | null>(null);
  const [together, setTogether] = useState<Together>({ everyone: false, picked: [] });
  const poolLane = chosenLane ?? hereLane;
  // From Home: my lane, the Audience, or (a joint someone else wrote in) a pool lane.
  const [laneId, setLaneId] = useState<string | null>(
    initial.kind === 'mine' ? initial.declaredLaneId : null,
  );
  const [shared, setShared] = useState<AudiencePick[]>(initial.sharedIn);
  // Made mine from Home, its Audience starts anew, as a new record's would.
  const [fresh, setFresh] = useState<AudiencePick[] | null>(null);
  const [poolLaneId, setPoolLaneId] = useState(initial.poolLaneId);
  const stuck = initial.kind === 'joint' && initial.othersWrote;

  if (pool && inPool) {
    const joint = initial.kind === 'joint';
    const fixed = joint ? initial.invitees.filter((id) => id !== me) : [];
    // My own record: With is not offered, so it never becomes joint here;
    // a joint record's With only adds people (Yoonji, in the session).
    const conversion = poolLane
      ? planFromPool(current, pool, poolLane, [], false)
      : ({ op: 'none' } as const);
    const removed = removedFrom(current, pool.poolId).map(poolName);
    const adding = joint && !initial.inviteAll;
    const inviteEveryone = adding && together.everyone;
    const invite =
      adding && !together.everyone ? together.picked.filter((id) => !fixed.includes(id)) : [];
    return {
      conversion,
      laneId: null,
      shared: initial.sharedIn,
      invite,
      inviteEveryone,
      changed: conversion.op !== 'none' || invite.length > 0 || inviteEveryone,
      confirm:
        conversion.op === 'to_joint' && initial.kind !== 'joint'
          ? { pool: pool.poolName, removed }
          : null,
      node: (
        <div data-edit-pool-lanes className="flex flex-col gap-2">
          <PoolLanePicker
            scope={pool}
            pick={poolLane ? { kind: joint ? 'joint' : 'own', poolLaneId: poolLane } : null}
            onPick={(next) => next && setChosenLane(next.poolLaneId)}
            together={together}
            onTogether={setTogether}
            fixed={fixed}
            fixedEveryone={joint && initial.inviteAll}
            withTogether={joint}
          />
          <Notes
            lines={
              conversion.op === 'to_joint' && removed.length > 0
                ? [`It will be removed from ${removed.join(', ')}.`]
                : []
            }
          />
        </div>
      ),
    };
  }

  if (stuck) {
    // Someone else wrote here: it stays in its pool, moved only among its lanes.
    const conversion: Conversion =
      poolLaneId && poolLaneId !== initial.poolLaneId
        ? { op: 'move_pool', poolLaneId }
        : { op: 'none' };
    return {
      conversion,
      laneId: null,
      shared: initial.sharedIn,
      invite: [],
      inviteEveryone: false,
      changed: conversion.op !== 'none',
      confirm: null,
      node: (
        <div data-edit-pool-lanes className="flex flex-col gap-2">
          <LaneChips
            categories={initial.poolLanes}
            selectedId={poolLaneId}
            onSelect={(id) => id && setPoolLaneId(id)}
            surface="white"
          />
          <Notes
            lines={[`Others have written here, so it stays in ${poolName(initial.poolId ?? '')}.`]}
          />
        </div>
      ),
    };
  }

  const conversion = planFromHome(current, laneId);
  const warnings = homeWarnings({ ...current, poolId: initial.poolId }, laneId, poolName);
  const mine = initial.kind === 'mine';
  const audience = mine ? shared : (fresh ?? defaultAudience(laneId, links));
  const setAudience = (next: (list: AudiencePick[]) => AudiencePick[]): void =>
    mine ? setShared(next) : setFresh(next(audience));
  const key = (list: AudiencePick[]): string =>
    list
      .map((p) => `${p.poolId}:${p.poolLaneId}`)
      .sort()
      .join();
  return {
    conversion,
    laneId,
    shared: audience,
    invite: [],
    inviteEveryone: false,
    changed: conversion.op !== 'none' || (mine && key(shared) !== key(initial.sharedIn)),
    confirm: null,
    node: (
      <div data-edit-my-lanes className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <LaneChips
              categories={categories}
              selectedId={laneId}
              onSelect={setLaneId}
              surface="white"
            />
          </div>
          {(mine || conversion.op === 'to_mine') && pools.length > 0 ? (
            <AudienceChip
              shared={audience}
              pools={pools}
              preselect={(poolId) =>
                preselectLane(
                  laneId,
                  poolId,
                  links,
                  lastPicked(laneId, poolId),
                  pools.find((p) => p.id === poolId)?.lanes.map((l) => l.id) ?? [],
                )
              }
              onChange={(poolId, chip) => {
                if (chip) rememberPick(laneId, poolId, chip);
                setAudience((list) => withPick(list, poolId, chip));
              }}
            />
          ) : null}
        </div>
        {initial.kind === 'own' && !laneId ? (
          <p data-edit-just-mine className="text-pool-500 text-xs">
            Yours · in {poolName(initial.poolId ?? '')}. Pick a lane to move it to Home.
          </p>
        ) : null}
        <Notes lines={warnings} />
      </div>
    ),
  };
}

function Notes({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul data-edit-warnings className="flex flex-col gap-1">
      {lines.map((line) => (
        <li key={line} data-edit-warning className="text-ink text-xs">
          {line}
        </li>
      ))}
    </ul>
  );
}
