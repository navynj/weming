'use client';

import { useState, type ReactNode } from 'react';

import { FilingChips } from '@/features/home/filing-chips';
import { LaneChips } from '@/features/input-sheet/lane-chips';
import { usePeople } from '@/features/people/people-provider';
import { preselectLane, withPick, withTogether, type AudiencePick } from '@/features/pool/audience';
import { AudienceChip } from '@/features/pool/audience-sheet';
import type { PoolScope } from '@/features/pool/compose-scope';
import { lastPicked, rememberPick } from '@/features/pool/last-pick';
import { PoolLanePicker } from '@/features/pool/pool-lane-picker';
import type { Together } from '@/features/pool/pool-pick';
import { SplashAudience } from '@/features/pool/splash-audience';

import { planFromHome, planFromPool, type Conversion, type Current } from './conversion';
import type { SplashEditState } from './edit-actions';
import type { SheetContext } from './splash-sheet';

type Loaded = Extract<SplashEditState, { ok: true }>;

export type EditLanes = {
  /** My pool record: With in its pool, when it changed (0035). */
  ownTogether?: Together | null;
  /** A joint record I made: its whole With, when it changed (0043). */
  jointTogether?: Together | null;
  conversion: Conversion;
  /** Mine from Home: the lane chosen (its declaration). */
  laneId: string | null;
  /** Mine from Home: the Audience as set, a pool lane per pool. */
  shared: AudiencePick[];
  /** A joint record: the members added in Together (0033), and Everyone turned on. */
  invite: string[];
  inviteEveryone: boolean;
  changed: boolean;
  node: ReactNode;
};

/**
 * The edit sheet's lanes (0022, 0033, H45). Opened from a pool the record
 * is in: that pool's lane chips, With on a joint record or my pool record,
 * and the Audience for my Home record or my pool record, as on its page. Opened from Home: my lanes and the Audience for my Home record;
 * for a pool record, a joint record or someone's record I wrote on, where it
 * shows on my Home — its pool's chip, then my lanes — filed at once, and for
 * my pool record its Audience too. Nothing changes kind here.
 */
export function useEditLanes(
  initial: Loaded,
  context: SheetContext,
  pool: PoolScope | null,
  onMoved: () => void,
): EditLanes {
  const { categories, pools } = context;
  const { me, people } = usePeople();
  const current: Current = {
    kind: initial.kind === 'theirs' ? 'mine' : initial.kind,
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

  // From a pool: the chosen pool lane and With.
  const [chosenLane, setChosenLane] = useState<string | null>(null);
  // A joint record its maker edits: its whole With, Everyone included (0043).
  const makerWith: Together | null =
    initial.kind === 'joint' && initial.isMaker
      ? { everyone: initial.inviteAll, picked: initial.invitees.filter((id) => id !== me) }
      : null;
  // A joint record: people added. My pool record: With in its pool (0035).
  const [together, setTogether] = useState<Together>(
    initial.kind === 'own' && initial.ownTogether
      ? initial.ownTogether
      : (makerWith ?? { everyone: false, picked: [] }),
  );
  const poolLane = chosenLane ?? hereLane;
  // From Home: my lane and the Audience, for my Home record.
  const [laneId, setLaneId] = useState<string | null>(
    initial.kind === 'mine' ? initial.declaredLaneId : null,
  );
  const [shared, setShared] = useState<AudiencePick[]>(initial.sharedIn);

  if (pool && inPool && initial.kind !== 'theirs') {
    const joint = initial.kind === 'joint';
    // A joint record's With only adds people, unless I made it: then it is
    // mine to change, Everyone and all (0043, Yoonji, in the session).
    const fixed = joint && !makerWith ? initial.invitees.filter((id) => id !== me) : [];
    const conversion = poolLane ? planFromPool(current, pool, poolLane) : ({ op: 'none' } as const);
    const adding = joint && !makerWith && !initial.inviteAll;
    const sorted = (t: Together): string =>
      JSON.stringify({ everyone: t.everyone, picked: [...t.picked].sort() });
    const jointChanged = makerWith !== null && sorted(together) !== sorted(makerWith);
    // Taken off: their slot goes; what they wrote stays, and their face (0043).
    const dropped = makerWith
      ? (makerWith.everyone ? [...initial.writerIds] : makerWith.picked).filter(
          (id) =>
            id !== me &&
            initial.writerIds.includes(id) &&
            !together.everyone &&
            !together.picked.includes(id),
        )
      : [];
    const inviteEveryone = adding && together.everyone;
    const invite =
      adding && !together.everyone ? together.picked.filter((id) => !fixed.includes(id)) : [];
    // My pool record: With in its pool sets who may add their side (0035).
    const own = initial.kind === 'own';
    const ownChanged =
      own && sorted(together) !== sorted(initial.ownTogether ?? { everyone: false, picked: [] });
    return {
      conversion,
      laneId: null,
      shared: initial.sharedIn,
      invite,
      inviteEveryone,
      ownTogether: ownChanged ? together : null,
      jointTogether: jointChanged ? together : null,
      changed:
        conversion.op !== 'none' ||
        invite.length > 0 ||
        inviteEveryone ||
        ownChanged ||
        jointChanged,
      node: (
        <div data-edit-pool-lanes className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <PoolLanePicker
                scope={pool}
                pick={poolLane ? { kind: joint ? 'joint' : 'own', poolLaneId: poolLane } : null}
                onPick={(next) => next && setChosenLane(next.poolLaneId)}
                together={together}
                onTogether={setTogether}
                fixed={fixed}
                fixedEveryone={joint && !makerWith && initial.inviteAll}
                withTogether={joint || own}
              />
            </div>
            {!joint && pools.length > 0 ? (
              // Switched in place, as on its page (H23, 0056): my pool
              // record's own pool always on until Move to Home.
              <SplashAudience
                splashId={initial.id}
                myLaneId={own ? (initial.home?.filed ?? null) : initial.declaredLaneId}
                shared={own ? initial.ownShared : initial.sharedIn}
                pools={pools}
                locked={own ? initial.poolId : null}
                moveHome={own ? { lanes: categories, filed: initial.home?.filed ?? null } : null}
                onMoved={onMoved}
              />
            ) : null}
          </div>
          <Notes
            lines={
              dropped.length > 0
                ? [
                    `${dropped
                      .map(
                        (id) =>
                          pool.members.find((m) => m.id === id)?.name ??
                          people[id]?.name ??
                          'Someone',
                      )
                      .join(', ')} ${
                      dropped.length === 1 ? 'has' : 'have'
                    } written here. What they wrote stays.`,
                  ]
                : []
            }
          />
        </div>
      ),
    };
  }

  if (initial.kind !== 'mine') {
    // Not a record of my lanes (H45): where it shows on my Home, filed at
    // once; and my pool record's Audience, its own pool locked on (0056)
    // until Move to Home.
    const own = initial.kind === 'own';
    return {
      conversion: { op: 'none' },
      laneId: null,
      shared: initial.sharedIn,
      invite: [],
      inviteEveryone: false,
      changed: false,
      node: (
        <div data-edit-home-filing className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {initial.home ? (
                <FilingChips
                  splashId={initial.id}
                  title={initial.title}
                  icon={initial.icon}
                  filing={initial.home}
                  categories={categories}
                />
              ) : null}
            </div>
            {own && pools.length > 0 ? (
              <SplashAudience
                splashId={initial.id}
                myLaneId={initial.home?.filed ?? null}
                shared={initial.ownShared}
                pools={pools}
                locked={initial.poolId}
                moveHome={{ lanes: categories, filed: initial.home?.filed ?? null }}
                onMoved={onMoved}
              />
            ) : null}
          </div>
          <p className="text-pool-500 text-xs">Only you see where it shows on your Home.</p>
        </div>
      ),
    };
  }

  const conversion = planFromHome(current, laneId);
  const key = (list: AudiencePick[]): string =>
    list
      .map(
        (p) =>
          `${p.poolId}:${p.poolLaneId}:${p.together?.everyone ? 'all' : [...(p.together?.picked ?? [])].sort().join('+')}`,
      )
      .sort()
      .join();
  return {
    conversion,
    laneId,
    shared,
    invite: [],
    inviteEveryone: false,
    changed: conversion.op !== 'none' || key(shared) !== key(initial.sharedIn),
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
          {pools.length > 0 ? (
            <AudienceChip
              shared={shared}
              pools={pools}
              preselect={(poolId) =>
                preselectLane(
                  lastPicked(laneId, poolId),
                  pools.find((p) => p.id === poolId)?.lanes.map((l) => l.id) ?? [],
                )
              }
              onChange={(poolId, chip) => {
                if (chip) rememberPick(laneId, poolId, chip);
                setShared((list) => withPick(list, poolId, chip));
              }}
              onTogether={(poolId, next) => setShared((list) => withTogether(list, poolId, next))}
            />
          ) : null}
        </div>
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
