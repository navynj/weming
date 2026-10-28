'use client';

import { useState, type ReactNode } from 'react';

import { EmojiInput } from '@/features/lanes/emoji-input';
import type { PoolLane } from '@/lib/queries/pools';
import { useOptimisticAction } from '@/lib/use-optimistic-action';

import { savePoolLane } from './actions';
import { PoolSheet, SheetTitle } from './sheet';

/**
 * The pool's lanes (H23), from the lane glyph at the header's left: any
 * member renames a lane, changes its emoji or its line of description, or
 * adds one. No roles in this phase; deleting a pool lane waits for them.
 */
export function PoolLanesSheet({
  poolId,
  lanes,
  onClose,
  inline = false,
}: {
  poolId: string;
  lanes: PoolLane[];
  onClose: () => void;
  /** Its rows alone, in the settings sheet's Pool tab (0059). */
  inline?: boolean;
}) {
  const shown = useOptimisticAction(lanes);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  // Each lane added remounts the form empty, so the next can be typed at once.
  const [added, setAdded] = useState(0);
  const Frame = inline ? InlineFrame : PoolSheet;
  return (
    <Frame label="Pool lanes" onClose={onClose}>
      {inline ? null : <SheetTitle>Pool lanes</SheetTitle>}
      {shown.message ? (
        <p role="alert" className="text-pool-500 mb-3 text-sm">
          {shown.message}
        </p>
      ) : null}
      <ul className="flex flex-col">
        {shown.value.map((lane) =>
          editing === lane.id ? (
            <li key={lane.id}>
              <PoolLaneForm
                lane={lane}
                onCancel={() => setEditing(null)}
                onSave={(fields) => {
                  setEditing(null);
                  shown.run(
                    (current) => current.map((l) => (l.id === lane.id ? { ...l, ...fields } : l)),
                    () => savePoolLane({ id: lane.id, poolId, ...fields }),
                  );
                }}
              />
            </li>
          ) : (
            <li key={lane.id}>
              <button
                type="button"
                data-pool-lane={lane.id}
                onClick={() => setEditing(lane.id)}
                className="border-pool-100 flex w-full items-center gap-3 border-b py-3 text-left"
              >
                <span aria-hidden className="text-2xl/none">
                  {lane.icon ?? '·'}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-ink truncate font-semibold">{lane.name}</span>
                  {lane.description ? (
                    <span className="text-pool-500 truncate text-xs">{lane.description}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
      {editing === 'new' ? (
        <PoolLaneForm
          key={added}
          lane={null}
          onCancel={() => setEditing(null)}
          onSave={(fields) => {
            // The form stays open, cleared, for the next lane.
            setAdded((n) => n + 1);
            shown.run(
              (current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  pool_id: poolId,
                  position: current.length,
                  ...fields,
                },
              ],
              () => savePoolLane({ id: null, poolId, ...fields }),
            );
          }}
        />
      ) : (
        <button
          type="button"
          data-add-pool-lane
          onClick={() => setEditing('new')}
          className="text-main-900 mt-4 self-start py-2 text-sm font-semibold"
        >
          + Add lane
        </button>
      )}
    </Frame>
  );
}

type LaneFields = { name: string; icon: string | null; description: string | null };

function PoolLaneForm({
  lane,
  onCancel,
  onSave,
}: {
  lane: PoolLane | null;
  onCancel: () => void;
  onSave: (fields: LaneFields) => void;
}) {
  const [icon, setIcon] = useState(lane?.icon ?? '');
  const [name, setName] = useState(lane?.name ?? '');
  const [description, setDescription] = useState(lane?.description ?? '');
  const save = (): void => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), icon: icon || null, description: description.trim() || null });
  };
  return (
    <div
      data-pool-lane-form
      className="border-pool-200 my-2 flex flex-col gap-3 rounded-2xl border p-4"
    >
      <div className="flex items-center gap-3">
        <EmojiInput value={icon} onChange={setIcon} label="Lane emoji" placeholder="🙂" />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            // Not mid-composition (Korean): that Enter commits the character.
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) save();
          }}
          // A new lane's form opens ready to type, and so does each next one.
          autoFocus={lane === null}
          maxLength={40}
          aria-label="Lane name"
          className="border-pool-200 text-ink h-12 min-w-0 flex-1 rounded-xl border px-3 outline-none"
        />
      </div>
      <input
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={80}
        aria-label="Lane description"
        placeholder="A line about this lane (optional)"
        className="border-pool-200 text-ink h-11 rounded-xl border px-3 text-sm outline-none"
      />
      <div className="flex justify-end gap-4 text-sm">
        <button type="button" onClick={onCancel} className="text-pool-500">
          Cancel
        </button>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={save}
          className="text-main-900 font-semibold disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}

/** Inline (0059): the rows in a tab of the settings sheet, with no sheet of their own. */
function InlineFrame({ children }: { label: string; onClose: () => void; children: ReactNode }) {
  return <div data-pool-lanes-editor>{children}</div>;
}
