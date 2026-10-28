'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CategoryChip } from '@/components/ui/chips/category-chip';
import { Monogram } from '@/components/ui/monogram';
import { useInputSheet } from '@/features/input-sheet/sheet-provider';
import type { MyCategory } from '@/lib/queries/profile';

import { fileOnHome } from './filing-actions';
import { ownPoolColumn } from './grid';

/** How long a filing stays laid over Home before the re-read has surely landed. */
const SETTLE_MS = 2500;

/** Where a record not in my lanes sits on Home, as the filing row reads it (H45). */
export type HomeFiling = {
  pool: { id: string; name: string; photo: string | null };
  /** Its pool lane, whose emoji its mark borrows in the pool's column. */
  poolLane: { icon: string | null; name: string } | null;
  /** The lane of mine I filed it in, or null: the pool's column. */
  filed: string | null;
};

/**
 * Home filing (H45): the pool's chip, then my lanes. A lane of mine files
 * the record there on my Home; the pool's chip takes it back to the pool's
 * column. No confirm and nothing to save: it moves at once, and the other
 * chip moves it back. Nothing about the record changes, and no one else
 * sees it.
 */
export function FilingChips({
  splashId,
  title,
  icon,
  filing,
  categories,
}: {
  splashId: string;
  /** The record's title and icon, as Home draws it while the filing lands. */
  title: string;
  icon: string | null;
  filing: HomeFiling;
  categories: Pick<MyCategory, 'id' | 'name' | 'icon'>[];
}) {
  const router = useRouter();
  const { markEdited, clearEdited, dropFailed } = useInputSheet();
  const [filed, setFiled] = useState(filing.filed);

  function file(laneId: string | null): void {
    if (laneId === filed) return;
    const was = filed;
    setFiled(laneId);
    const lane = laneId ? categories.find((c) => c.id === laneId) : null;
    // Shown at once (CLAUDE.md, the principle); a refusal takes it back.
    markEdited(splashId, {
      title,
      icon,
      homeColumn: laneId
        ? { column: laneId, lane: lane ? { icon: lane.icon, name: lane.name } : null }
        : {
            column: ownPoolColumn(filing.pool.id),
            lane: filing.poolLane ? { icon: filing.poolLane.icon, name: filing.pool.name } : null,
          },
    });
    fileOnHome(splashId, laneId)
      .then((done) => {
        if (!done.ok) {
          setFiled(was);
          clearEdited(splashId);
          dropFailed(done.message);
          return;
        }
        router.refresh();
        window.setTimeout(() => clearEdited(splashId), SETTLE_MS);
      })
      .catch(() => {
        setFiled(was);
        clearEdited(splashId);
        dropFailed('That did not go through. Try again.');
      });
  }

  return (
    <div
      role="group"
      aria-label="Where it shows on Home"
      data-filing-chips
      className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1"
    >
      <button
        type="button"
        aria-pressed={filed === null}
        data-filing-pool={filing.pool.id}
        onClick={() => file(null)}
        // Selection is ink (H20f), as a lane chip's.
        className={`flex shrink-0 items-center gap-1 rounded-full py-1 pr-2.5 pl-1.5 text-xs transition-colors ${
          filed === null ? 'bg-ink text-white' : 'text-pool-500 hover:bg-pool-200 bg-pool-100'
        }`}
      >
        <Monogram name={filing.pool.name} size="chip" photo={filing.pool.photo} />
        {filing.pool.name}
      </button>
      {categories.map((lane) => (
        <span key={lane.id} data-filing-lane={lane.id} className="contents">
          <CategoryChip
            icon={lane.icon}
            name={lane.name}
            selected={lane.id === filed}
            onSelect={() => file(lane.id)}
          />
        </span>
      ))}
    </div>
  );
}
