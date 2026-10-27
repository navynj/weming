'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

import { CategoryChip } from '@/components/ui/chips/category-chip';
import type { MyCategory } from '@/lib/queries/profile';

/**
 * Past this many lanes a search field renders above the row. A constant, not
 * a measurement: mere one-row overflow scrolls silently, and a search box over
 * six chips would be a control for a problem the author does not have.
 */
export const LANE_SEARCH_THRESHOLD = 8;

/**
 * The sheet's top zone (`_docs/mockups/sheet-ripple.png`): the lane chips in
 * one horizontally scrolling row, selected = ink fill (H20f).
 *
 * Always the author's (H21f): a post's declared lane is where the selection
 * starts, never a narrowing of what may be chosen.
 */
export function LaneChips({
  categories,
  selectedId,
  onSelect,
  surface = 'pool',
}: {
  categories: Pick<MyCategory, 'id' | 'name' | 'icon'>[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** The row's own ground: the old sheet's grey band, or a white page. */
  surface?: 'pool' | 'white';
}) {
  const [query, setQuery] = useState('');
  const offered = categories;
  const searchable = offered.length > LANE_SEARCH_THRESHOLD;
  const shown = searchable
    ? offered.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : offered;

  return (
    <div
      className={
        surface === 'pool'
          ? 'bg-pool-100 flex flex-col gap-2 px-5 pt-3 pb-3'
          : 'flex flex-col gap-2'
      }
    >
      {searchable ? (
        <label className="text-pool-500 flex items-center gap-2 text-base">
          <Search aria-hidden size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Lanes"
            aria-label="Search"
            className="placeholder:text-pool-500 text-ink min-w-0 flex-1 bg-transparent outline-none placeholder:opacity-60"
          />
        </label>
      ) : null}

      {/* No scroll indicator: a bar under a row of chips reads as a gauge,
          which law 2 forbids. They scroll silently. */}
      <div
        role="group"
        aria-label="Lane"
        className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1"
      >
        {shown.map((category) => (
          <CategoryChip
            key={category.id}
            icon={category.icon}
            name={category.name}
            selected={category.id === selectedId}
            // Tapping the chosen chip again lets go of it: no lane is a
            // valid state, and the residual lane takes the fragment.
            onSelect={() => onSelect(category.id === selectedId ? null : category.id)}
          />
        ))}
      </div>
    </div>
  );
}
