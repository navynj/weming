'use client';

import { useState, type ReactNode } from 'react';

import { LaneChips } from '@/features/input-sheet/lane-chips';
import { usePeople } from '@/features/people/people-provider';
import { preselectLane, withPick, type AudiencePick } from '@/features/pool/audience';
import { AudienceChip } from '@/features/pool/audience-sheet';
import type { PoolScope } from '@/features/pool/compose-scope';
import { lastPicked, rememberPick } from '@/features/pool/last-pick';
import { Switch } from '@/features/pool/lane-match';
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
 * that pool's lane chips and Together, and for a joint record only I wrote
 * in, "Make it mine". Opened from Home: my lanes — with the Audience for my
 * Home record, and for a pool or joint record a move to Home; a joint record
 * someone else wrote in keeps to its pool's lanes.
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

  // From a pool: the chosen pool lane, Together, and Make it mine.
  const [chosenLane, setChosenLane] = useState<string | null>(null);
  const [together, setTogether] = useState<Together>({ everyone: false, picked: [] });
  const [toPoolRecord, setToPoolRecord] = useState(false);
  const poolLane = chosenLane ?? hereLane;
  // From Home: my lane, the Audience, or (a joint someone else wrote in) a pool lane.
  const [laneId, setLaneId] = useState<string | null>(
    initial.kind === 'mine' ? initial.declaredLaneId : null,
  );
  const [shared, setShared] = useState<AudiencePick[]>(initial.sharedIn);
  const [poolLaneId, setPoolLaneId] = useState(initial.poolLaneId);
  const stuck = initial.kind === 'joint' && initial.othersWrote;

  if (pool && inPool) {
    const joint = initial.kind === 'joint';
    const fixed = joint ? initial.invitees.filter((id) => id !== me) : [];
    const conversion = poolLane
      ? planFromPool(
          current,
          pool,
          poolLane,
          joint ? [] : together.picked,
          toPoolRecord,
          !joint && together.everyone,
        )
      : ({ op: 'none' } as const);
    const removed = removedFrom(current, pool.poolId).map(poolName);
    const adding = joint && !toPoolRecord && !initial.inviteAll;
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
            together={toPoolRecord ? { everyone: false, picked: [] } : together}
            onTogether={setTogether}
            fixed={toPoolRecord ? [] : fixed}
            fixedEveryone={!toPoolRecord && joint && initial.inviteAll}
            togetherLocked={toPoolRecord ? `Yours · in ${pool.poolName}` : null}
          />
          {joint && !stuck ? (
            <label data-make-mine className="text-ink flex items-center justify-between text-xs">
              Make it mine
              <Switch
                on={toPoolRecord}
                onChange={setToPoolRecord}
                label="Make it mine"
                tone="ink"
                size="sm"
              />
            </label>
          ) : null}
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
  const key = (list: AudiencePick[]): string =>
    list
      .map((p) => `${p.poolId}:${p.poolLaneId}`)
      .sort()
      .join();
  return {
    conversion,
    laneId,
    shared,
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
          {mine && pools.length > 0 ? (
            <AudienceChip
              shared={shared}
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
                setShared((list) => withPick(list, poolId, chip));
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
