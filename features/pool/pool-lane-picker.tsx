'use client';

import { usePeople } from '@/features/people/people-provider';

import type { PoolScope } from './compose-scope';
import {
  landingHint,
  resolvePick,
  toggleEveryone,
  toggleFace,
  type PoolPick,
  type Together,
} from './pool-pick';

export type { PoolPick } from './pool-pick';

/**
 * Composing from a pool (review, 0033): this pool's lane chips, the one
 * filled element; under them, **Together** — "Together · Everyone" on its
 * label line, Everyone an underlined text button (muted, the primary colour
 * when on), then the other members' faces, the only round items — and one
 * line saying what Drop makes: "Yours · in <Pool>", "Together with
 * everyone", or "Together with Mina, Jae". There is no audience here: what
 * is written in a pool is in that pool.
 */
export function PoolLanePicker({
  scope,
  pick,
  onPick,
  together,
  onTogether,
  fixed = [],
  fixedEveryone = false,
  togetherLocked = null,
}: {
  scope: PoolScope;
  pick: PoolPick;
  onPick: (pick: PoolPick) => void;
  /** Everyone and the faces picked, me never among them. */
  together: Together;
  onTogether: (together: Together) => void;
  /** Editing a joint record: already together, shown picked and kept (nobody is taken off). */
  fixed?: string[];
  fixedEveryone?: boolean;
  /** Why Together cannot change, shown in the hint's place. */
  togetherLocked?: string | null;
}) {
  const { me } = usePeople();
  const others = scope.members.filter((m) => m.id !== me);
  const otherIds = others.map((m) => m.id);
  const everyone = fixedEveryone || together.everyone;
  const picked = everyone ? otherIds : [...new Set([...fixed, ...together.picked])];
  const names = others.filter((m) => picked.includes(m.id)).map((m) => m.name);
  const change = (next: Together): void => {
    onTogether(next);
    if (pick) onPick(resolvePick(pick.poolLaneId, [...fixed, ...next.picked], next.everyone));
  };

  return (
    <div data-pool-lane-picker className="flex flex-col gap-3">
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {scope.lanes.map((lane) => {
          const selected = pick?.poolLaneId === lane.id;
          return (
            <button
              key={lane.id}
              type="button"
              aria-pressed={selected}
              data-pick-pool-lane={lane.id}
              onClick={() => onPick(selected ? null : resolvePick(lane.id, picked, everyone))}
              className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${
                // Selection is ink (H20f); the chips are the one fill here.
                selected ? 'bg-ink text-white' : 'border-pool-200 text-ink border'
              }`}
            >
              {lane.icon ? `${lane.icon} ` : ''}
              {lane.name}
            </button>
          );
        })}
      </div>
      {others.length > 0 ? (
        <div data-together className="flex flex-col gap-2">
          <span className="text-pool-500 flex items-center gap-1 text-xs">
            Together ·
            <button
              type="button"
              aria-pressed={everyone}
              data-together-everyone
              disabled={fixedEveryone || togetherLocked !== null}
              onClick={() => change(toggleEveryone(together, otherIds))}
              className={`underline underline-offset-2 disabled:cursor-default ${
                everyone ? 'text-main-900 font-semibold' : 'text-pool-500'
              }`}
            >
              Everyone
            </button>
          </span>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {others.map((member) => {
              const on = picked.includes(member.id);
              const kept = fixedEveryone || fixed.includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={member.name}
                  data-together-face={member.id}
                  disabled={kept || togetherLocked !== null}
                  onClick={() => change(toggleFace(together, member.id, otherIds))}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold disabled:cursor-default ${
                    on ? 'bg-ink text-white' : 'bg-pool-100 text-pool-500'
                  }`}
                >
                  {member.initials}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <span data-landing-hint className="text-pool-500 min-w-0 truncate text-xs">
        {togetherLocked ?? (pick ? landingHint(scope.poolName, names, everyone) : null)}
      </span>
    </div>
  );
}
