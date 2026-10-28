'use client';

import { useState } from 'react';
import { Users } from 'lucide-react';

import { usePeople } from '@/features/people/people-provider';
import type { PoolFace, PoolLaneChip } from '@/lib/queries/pools';

import { audienceLabel, NOBODY, type AudiencePick, type PickTogether } from './audience';
import { WithLine } from './with-line';
import { Switch } from './lane-match';
import { PoolSheet, SheetTitle } from './sheet';

/** A pool I am in, with its lanes and members: one row in Audience. */
export type AudiencePool = {
  id: string;
  name: string;
  lanes: PoolLaneChip[];
  members?: PoolFace[];
};

/**
 * The Audience chip (H23, 0033): one compact chip beside the lane picker in
 * the composer and in a record's header, saying where it is shared — *Only
 * me*, "<Pool> · <emoji> <pool lane>", or *N pools*. A tap opens the sheet.
 * A joint record has no chip: it belongs to its pool.
 */
export function AudienceChip({
  shared,
  pools,
  preselect,
  onChange,
  onTogether,
  locked = null,
}: {
  /** Where the record is shared now: a pool lane per pool. */
  shared: AudiencePick[];
  /** Every pool I am in: a row each. */
  pools: AudiencePool[];
  /** The chip a pool starts on when turned on (a link's default, my last pick), or none. */
  preselect: (poolId: string) => string | null;
  /** A pool on a pool lane, or off (null). */
  onChange: (poolId: string, poolLaneId: string | null) => void;
  /** With, per pool that is on (0035); absent, no With line. */
  onTogether?: (poolId: string, together: PickTogether) => void;
  /** A pool record's own pool (0056): always on, its lane still picked. */
  locked?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const on = shared.filter((pick) => pools.some((p) => p.id === pick.poolId));
  return (
    <>
      <button
        type="button"
        data-audience-chip
        aria-label={`Audience: ${chipLabel(on, pools)}`}
        onClick={() => setOpen(true)}
        className="border-pool-200 text-ink inline-flex h-8 max-w-[12rem] shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm"
      >
        <Users aria-hidden size={14} className="text-pool-500 shrink-0" />
        <span className="truncate">{chipLabel(on, pools)}</span>
      </button>
      {open ? (
        <AudienceSheet
          pools={pools}
          shared={on}
          preselect={preselect}
          onChange={onChange}
          onTogether={onTogether}
          locked={locked}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** "Only me", "Our Pool · 🎲 Games", or "N pools". */
export function chipLabel(shared: AudiencePick[], pools: AudiencePool[]): string {
  if (shared.length === 1) {
    const pool = pools.find((p) => p.id === shared[0].poolId);
    const lane = pool?.lanes.find((l) => l.id === shared[0].poolLaneId);
    if (pool && lane) return `${pool.name} · ${lane.icon ? `${lane.icon} ` : ''}${lane.name}`;
  }
  return audienceLabel(
    shared.map((pick) => pools.find((p) => p.id === pick.poolId)?.name ?? 'A pool'),
  );
}

/**
 * Where a record is shared (0033): a row per pool I am in, each with a
 * switch. Turned on, the row shows that pool's lane chips, and one must be
 * picked: the switch starts on the preselected chip, or waits for a pick
 * with nothing shared yet. Sections, so a *Followers* row can join *Pools*
 * later without reshaping this; only Pools is built.
 */
function AudienceSheet({
  pools,
  shared,
  preselect,
  onChange,
  onTogether,
  locked,
  onClose,
}: {
  pools: AudiencePool[];
  shared: AudiencePick[];
  preselect: (poolId: string) => string | null;
  onChange: (poolId: string, poolLaneId: string | null) => void;
  onTogether?: (poolId: string, together: PickTogether) => void;
  locked: string | null;
  onClose: () => void;
}) {
  const { me } = usePeople();
  // Turned on with no chip to start on: shown on, shared only once picked.
  const [waiting, setWaiting] = useState<string[]>([]);
  const laneOf = (poolId: string): string | null =>
    shared.find((pick) => pick.poolId === poolId)?.poolLaneId ?? null;
  return (
    <PoolSheet label="Audience" onClose={onClose}>
      <SheetTitle>Audience</SheetTitle>
      <p className="text-pool-500 -mt-2 mb-5 text-sm">
        Every ripple on this splash follows it. With every switch off, it is yours alone.
      </p>
      <section data-audience-section="Pools" className="mb-6">
        <h3 className="text-pool-500 mb-1 text-xs">Pools</h3>
        <ul className="flex flex-col">
          {pools.map((pool) => {
            const lane = laneOf(pool.id);
            const on = lane !== null || waiting.includes(pool.id);
            return (
              <li
                key={pool.id}
                data-audience-row={pool.id}
                className="border-pool-100 flex flex-col gap-3 border-b py-3"
              >
                <span className="flex items-center justify-between gap-4">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-ink truncate">Shared to {pool.name}</span>
                    {pool.id === locked ? (
                      // Written there (0056): it cannot be turned off; its lane can change.
                      <span data-audience-origin className="text-pool-500 text-xs">
                        Written here, always shared
                      </span>
                    ) : null}
                  </span>
                  <Switch
                    on={on}
                    disabled={pool.id === locked}
                    label={`Shared to ${pool.name}`}
                    onChange={(next) => {
                      if (!next) {
                        setWaiting((list) => list.filter((id) => id !== pool.id));
                        onChange(pool.id, null);
                        return;
                      }
                      const start = preselect(pool.id);
                      if (start) onChange(pool.id, start);
                      else setWaiting((list) => [...list, pool.id]);
                    }}
                  />
                </span>
                {on ? (
                  <span
                    data-audience-lanes={pool.id}
                    className="no-scrollbar flex gap-2 overflow-x-auto"
                  >
                    {pool.lanes.map((chip) => {
                      const selected = chip.id === lane;
                      return (
                        <button
                          key={chip.id}
                          type="button"
                          aria-pressed={selected}
                          data-audience-lane={chip.id}
                          onClick={() => {
                            setWaiting((list) => list.filter((id) => id !== pool.id));
                            onChange(pool.id, chip.id);
                          }}
                          className={`h-9 shrink-0 rounded-full px-3 text-sm font-semibold ${
                            // Selection is ink (H20f).
                            selected ? 'bg-ink text-white' : 'border-pool-200 text-ink border'
                          }`}
                        >
                          {chip.icon ? `${chip.icon} ` : ''}
                          {chip.name}
                        </button>
                      );
                    })}
                  </span>
                ) : null}
                {/* With, in this pool (0035): once it sits on a pool lane. */}
                {lane && onTogether ? (
                  <WithLine
                    poolId={pool.id}
                    faces={(pool.members ?? []).filter((m) => m.id !== me)}
                    together={shared.find((p) => p.poolId === pool.id)?.together ?? NOBODY}
                    onChange={(next) => onTogether(pool.id, next)}
                  />
                ) : null}
              </li>
            );
          })}
          {pools.length === 0 ? (
            <li className="text-pool-500 py-3 text-sm">You are in no Pool yet.</li>
          ) : null}
        </ul>
      </section>
    </PoolSheet>
  );
}
