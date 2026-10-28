'use client';

import { useState } from 'react';

import { EmojiInput } from '@/features/lanes/emoji-input';

/** A pool lane before the pool exists: keyed in the browser. */
export type DraftLane = {
  key: string;
  name: string;
  icon: string | null;
  description: string | null;
};

/**
 * The pool's lanes on the create screen (1c): each a quiet chip with its
 * emoji and name — tap to edit or remove — and a dashed `+ Add lane`.
 * Editing opens one inline row: the emoji (one grapheme, as everywhere), the
 * name, and an optional line of description (80 characters at most) shown
 * under the lane in the pool.
 */
export function LaneEditor({
  lanes,
  onChange,
}: {
  lanes: DraftLane[];
  onChange: (lanes: DraftLane[]) => void;
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(lanes.length === 0 ? 'new' : null);
  const current = lanes.find((lane) => lane.key === editing) ?? null;

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {lanes.map((lane) => (
          <button
            key={lane.key}
            type="button"
            data-draft-lane={lane.key}
            onClick={() => setEditing(lane.key)}
            className={`bg-pool-100 text-main-900 flex h-12 items-center gap-1.5 rounded-2xl px-4 text-sm font-semibold ${
              editing === lane.key ? 'ring-main-900 ring-2' : ''
            }`}
          >
            {lane.icon ? <span aria-hidden>{lane.icon}</span> : null}
            {lane.name}
          </button>
        ))}
        {editing === 'new' ? null : (
          <button
            type="button"
            data-add-lane
            onClick={() => setEditing('new')}
            className="border-pool-200 text-pool-500 h-12 rounded-2xl border border-dashed px-5 text-sm"
          >
            + Add lane
          </button>
        )}
      </div>

      {editing !== null ? (
        <LaneForm
          key={editing}
          lane={current}
          onCancel={lanes.length === 0 ? null : () => setEditing(null)}
          onRemove={
            current ? () => (onChange(lanes.filter((l) => l !== current)), setEditing(null)) : null
          }
          onSave={(saved) => {
            onChange(
              current
                ? lanes.map((l) => (l === current ? { ...saved, key: current.key } : l))
                : [...lanes, { ...saved, key: crypto.randomUUID() }],
            );
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function LaneForm({
  lane,
  onCancel,
  onRemove,
  onSave,
}: {
  lane: DraftLane | null;
  onCancel: (() => void) | null;
  onRemove: (() => void) | null;
  onSave: (lane: Omit<DraftLane, 'key'>) => void;
}) {
  const [icon, setIcon] = useState(lane?.icon ?? '');
  const [name, setName] = useState(lane?.name ?? '');
  const [description, setDescription] = useState(lane?.description ?? '');
  const save = (): void => {
    if (!name.trim()) return;
    onSave({ icon: icon || null, name: name.trim(), description: description.trim() || null });
  };
  return (
    <div data-lane-form className="border-pool-200 flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-center gap-3">
        <EmojiInput value={icon} onChange={setIcon} label="Lane emoji" placeholder="🙂" />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) save();
          }}
          maxLength={40}
          aria-label="Lane name"
          placeholder="Lane name"
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
      <div className="flex items-center justify-between text-sm">
        {onRemove ? (
          <button type="button" onClick={onRemove} className="text-pool-500">
            Remove
          </button>
        ) : (
          <span />
        )}
        <span className="flex gap-4">
          {onCancel ? (
            <button type="button" onClick={onCancel} className="text-pool-500">
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            data-save-lane
            disabled={!name.trim()}
            onClick={save}
            className="text-main-900 font-semibold disabled:opacity-40"
          >
            {lane ? 'Save' : 'Add'}
          </button>
        </span>
      </div>
    </div>
  );
}
