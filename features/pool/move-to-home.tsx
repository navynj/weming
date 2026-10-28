'use client';

import { useState } from 'react';

import { LaneChips } from '@/features/input-sheet/lane-chips';
import { saveLane } from '@/features/lanes/actions';
import { EmojiInput } from '@/features/lanes/emoji-input';
import type { MyCategory } from '@/lib/queries/profile';

export type MoveHome = {
  /** My lanes, to move it into. */
  lanes: Pick<MyCategory, 'id' | 'name' | 'icon'>[];
  /** Where I filed it on Home, if anywhere: the chip it starts on. */
  filed?: string | null;
  /** It becomes a record of this lane of mine, every pool kept. */
  onMove: (laneId: string) => void;
};

/**
 * Move to Home (H45), from the Audience sheet's `…`: "Keep it in which of
 * your lanes?" — a lane of mine, or a new one. Saving makes my record
 * written in a pool a record of that lane; every pool keeps it as it is,
 * and its origin's switch unlocks. Cancel changes nothing.
 */
export function MoveToHome({ move, onCancel }: { move: MoveHome; onCancel: () => void }) {
  const [laneId, setLaneId] = useState<string | null>(move.filed ?? null);
  const [making, setMaking] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ready = making ? name.trim() !== '' && icon.trim() !== '' : laneId !== null;

  async function keep(): Promise<void> {
    if (!making) {
      if (laneId) move.onMove(laneId);
      return;
    }
    setSaving(true);
    const made = await saveLane({ id: null, name: name.trim(), icon: icon.trim() });
    setSaving(false);
    if (!made.ok || !made.id) {
      setMessage(made.ok ? 'That lane didn’t save. Try again.' : made.message);
      return;
    }
    move.onMove(made.id);
  }

  return (
    <div
      role="alertdialog"
      aria-label="Keep it in which of your lanes?"
      data-move-to-home
      className="bg-pool-100 flex flex-col gap-3 rounded-2xl p-4"
    >
      <p className="text-ink text-sm font-semibold">Keep it in which of your lanes?</p>
      <p className="text-pool-500 -mt-2 text-xs">
        It stays shared everywhere it is now, and becomes a record of that lane.
      </p>
      {making ? (
        <div className="flex items-center gap-2">
          <EmojiInput value={icon} onChange={setIcon} label="New lane icon" placeholder="🙂" />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            aria-label="New lane name"
            data-move-new-lane-name
            placeholder="Lane name"
            className="text-ink min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm outline-none"
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <LaneChips
            categories={move.lanes}
            selectedId={laneId}
            onSelect={setLaneId}
            surface="white"
          />
          <button
            type="button"
            data-move-new-lane
            onClick={() => setMaking(true)}
            className="text-pool-500 h-9 shrink-0 text-sm"
          >
            + New lane
          </button>
        </div>
      )}
      {message ? (
        <p role="alert" className="text-pool-500 text-xs">
          {message}
        </p>
      ) : null}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="border-pool-200 text-ink flex-1 rounded-full border bg-white py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          data-move-to-home-go
          disabled={!ready || saving}
          onClick={() => void keep()}
          className="bg-main-900 flex-1 rounded-full py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Move to Home
        </button>
      </div>
    </div>
  );
}
