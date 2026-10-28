'use client';

import { useRef, useState } from 'react';
import { GripVertical, Trash2 } from 'lucide-react';

import type { ActionOutcome } from '@/lib/use-optimistic-action';

import { EmojiInput } from './emoji-input';

/** What the rows edit, on Home's lanes and a pool's alike (H42b). */
export type EditableLane = {
  id: string;
  name: string;
  icon: string | null;
  position: number;
  description?: string | null;
};

/** One row as Save writes it; a lane added here has no id yet. */
export type LaneFields = {
  id: string | null;
  name: string;
  icon: string;
  description: string | null;
};

/** A row added in this round, until Save gives it a real id. */
const DRAFT = 'draft:';

/**
 * The lane rows (H42b): every lane in a row, its icon and its name edited in
 * place and its order changed by dragging the grip (arrow keys on the grip
 * for a keyboard), "+ Add lane" for a new row, and, where a lane may go, a
 * Delete per row behind a small confirm; one Save for whatever changed. Home's
 * lanes and a pool's use the same rows; the place gives the writes.
 *
 * Every change shows at once and the action runs behind it (CLAUDE.md, the
 * principle): `apply` is the place's optimistic lane state, and the rows are
 * derived from it, so a refused write comes back on its own.
 */
export function LaneRows<T extends EditableLane>({
  lanes,
  apply,
  message,
  onDone,
  save,
  reorder,
  remove,
  draft,
  iconRequired,
  describe = false,
  maxName,
}: {
  lanes: T[];
  apply: (updater: (current: T[]) => T[], work: () => Promise<ActionOutcome>) => void;
  /** The last refusal, from the place's optimistic lane state. */
  message?: string | null;
  /** Cancel or Save: the caller starts the rows afresh. */
  onDone: () => void;
  /** Writes one lane; a new one answers with its id, so the order can name it. */
  save: (fields: LaneFields) => Promise<{ ok: true; id?: string } | { ok: false; message: string }>;
  reorder: (ids: string[]) => Promise<ActionOutcome>;
  /** Deleting, where a lane may go (Home's; a pool's waits for roles). */
  remove?: (id: string) => Promise<ActionOutcome>;
  /** A new lane as the screen shows it before the database names it. */
  draft: (fields: LaneFields & { id: string }, position: number) => T;
  /** Home's lanes need an icon; a pool's may go without (shown as ·). */
  iconRequired: boolean;
  /** A pool lane's line of description, under its name. */
  describe?: boolean;
  maxName: number;
}) {
  // The order the hand has given, the words it has typed and the rows it has
  // added, over the lanes the place holds; a lane gone there is gone here.
  const [order, setOrder] = useState(() => lanes.map((lane) => lane.id));
  const [edits, setEdits] = useState<
    Record<string, { name?: string; icon?: string; description?: string }>
  >({});
  const [added, setAdded] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);

  const known = (id: string): boolean => lanes.some((lane) => lane.id === id) || added.includes(id);
  /** The rows' ids in the hand's order, over the lanes the place holds right now. */
  const idsOf = (given: string[]): string[] => [
    ...given.filter(known),
    ...lanes.filter((lane) => !given.includes(lane.id)).map((lane) => lane.id),
    ...added.filter((id) => !given.includes(id)),
  ];
  const ids = idsOf(order);
  const rows = ids.map((id) => {
    const lane = lanes.find((l) => l.id === id);
    return {
      id,
      name: edits[id]?.name ?? lane?.name ?? '',
      icon: edits[id]?.icon ?? lane?.icon ?? '',
      description: edits[id]?.description ?? lane?.description ?? '',
    };
  });

  const changed = rows.filter((row) => {
    const was = lanes.find((lane) => lane.id === row.id);
    if (!was) return true;
    return (
      row.name.trim() !== was.name ||
      row.icon.trim() !== (was.icon ?? '') ||
      (describe && row.description.trim() !== (was.description ?? ''))
    );
  });
  const complete = rows.every(
    (row) => row.name.trim().length > 0 && (!iconRequired || row.icon.trim().length > 0),
  );
  const reordered = rows.some((row, index) => row.id !== lanes[index]?.id);

  function edit(id: string, patch: Partial<{ name: string; icon: string; description: string }>) {
    setEdits((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function add(): void {
    const id = `${DRAFT}${crypto.randomUUID()}`;
    setAdded((current) => [...current, id]);
    setOrder((given) => [...idsOf(given), id]);
  }

  /**
   * Puts the row at `to`, shifting the others; the order the drag reads.
   * Computed from the latest order, never the one the drag began with: a
   * fast drag fires moves faster than the rows re-render, and a stale
   * order would drop the ones in between.
   */
  function moveTo(id: string, to: number): void {
    setOrder((given) => {
      const current = idsOf(given);
      const from = current.indexOf(id);
      if (from === -1 || to < 0 || to >= current.length || to === from) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
  }

  /** Gone at once; a lane with records comes back with the refusal (H19). */
  function drop(id: string): void {
    setConfirming(null);
    if (id.startsWith(DRAFT)) {
      setAdded((current) => current.filter((a) => a !== id));
      return;
    }
    if (!remove) return;
    apply(
      (current) => current.filter((lane) => lane.id !== id),
      () => remove(id),
    );
  }

  /**
   * Dragging: the grip takes the pointer, and as it crosses a row's middle
   * the dragged row takes that row's place — a live reorder, no ghost. Works
   * for touch and mouse alike through pointer events.
   */
  function dragFrom(id: string, event: React.PointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    const grip = event.currentTarget;
    if (typeof grip.setPointerCapture === 'function') grip.setPointerCapture(event.pointerId);
    setDragging(id);

    const over = (y: number): number => {
      const rowEls = [...(list.current?.querySelectorAll<HTMLElement>('[data-lane-row]') ?? [])];
      const index = rowEls.findIndex((el) => {
        const box = el.getBoundingClientRect();
        return y < box.top + box.height / 2;
      });
      return index === -1 ? rowEls.length - 1 : index;
    };
    const onMove = (move: PointerEvent): void => moveTo(id, over(move.clientY));
    const onUp = (): void => {
      setDragging(null);
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  }

  function commit(): void {
    const fields = (row: (typeof rows)[number]): LaneFields => ({
      id: row.id.startsWith(DRAFT) ? null : row.id,
      name: row.name.trim(),
      icon: row.icon.trim(),
      description: row.description.trim() || null,
    });
    const next = rows.map((row) => ({ ...fields(row), id: row.id }));
    const toSave = changed.map((row) => ({ key: row.id, fields: fields(row) }));
    const sequence = rows.map((row) => row.id);
    onDone();
    apply(
      (current) =>
        sequence.map((id, position) => {
          const edited = next.find((row) => row.id === id)!;
          const lane = current.find((c) => c.id === id);
          if (!lane) return draft(edited, position);
          return {
            ...lane,
            name: edited.name,
            icon: edited.icon || null,
            ...(describe ? { description: edited.description } : {}),
            position,
          };
        }),
      async () => {
        // A new lane is written first, so the order can name it by its id.
        const named = new Map<string, string>();
        for (const { key, fields: row } of toSave) {
          const result = await save(row);
          if (!result.ok) return result;
          if (result.id) named.set(key, result.id);
        }
        const real = sequence.map((id) => named.get(id) ?? id);
        if (real.some((id) => id.startsWith(DRAFT))) {
          return { ok: false, message: 'That lane was not added. Try again.' };
        }
        return reordered || added.length > 0 ? reorder(real) : { ok: true };
      },
    );
  }

  return (
    <div data-lanes-editor className="flex flex-col gap-4">
      <ol ref={list} className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <li
            key={row.id}
            data-lane-row={row.id}
            data-dragging={dragging === row.id ? '' : undefined}
            className="flex items-center gap-3 transition-[opacity,transform] duration-100 motion-reduce:transition-none"
            style={dragging === row.id ? { opacity: 0.6, transform: 'scale(1.02)' } : undefined}
          >
            <button
              type="button"
              aria-label={`Move ${row.name || 'this lane'}`}
              data-lane-grip
              onPointerDown={(event) => dragFrom(row.id, event)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveTo(row.id, index - 1);
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveTo(row.id, index + 1);
                }
              }}
              className="text-pool-500 flex h-10 w-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
            >
              <GripVertical aria-hidden size={16} />
            </button>
            <EmojiInput
              value={row.icon}
              onChange={(icon) => edit(row.id, { icon })}
              label={`Icon for ${row.name || 'this lane'}`}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <input
                value={row.name}
                onChange={(event) => edit(row.id, { name: event.target.value })}
                aria-label="Lane name"
                placeholder="Enter the lane name"
                maxLength={maxName}
                // A row just added opens ready to type.
                autoFocus={row.id.startsWith(DRAFT)}
                className="text-ink placeholder:text-pool-500 border-pool-100 min-w-0 border-b py-2 text-base outline-none"
              />
              {describe ? (
                <input
                  value={row.description}
                  onChange={(event) => edit(row.id, { description: event.target.value })}
                  aria-label="Lane description"
                  placeholder="A line about this lane (optional)"
                  maxLength={80}
                  className="text-pool-500 placeholder:text-pool-500/70 min-w-0 py-1 text-xs outline-none"
                />
              ) : null}
            </span>
            {!remove && !row.id.startsWith(DRAFT) ? null : confirming === row.id ? (
              <span className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => drop(row.id)}
                  className="text-main-900 font-medium"
                >
                  Delete
                </button>
                <button type="button" onClick={() => setConfirming(null)} className="text-pool-500">
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                aria-label={`Delete ${row.name || 'this lane'}`}
                onClick={() => (row.id.startsWith(DRAFT) ? drop(row.id) : setConfirming(row.id))}
                className="text-pool-500 flex h-8 w-8 shrink-0 items-center justify-center"
              >
                <Trash2 aria-hidden size={14} />
              </button>
            )}
          </li>
        ))}
      </ol>

      <button
        type="button"
        data-add-lane
        onClick={add}
        className="text-main-900 self-start py-2 text-sm font-semibold"
      >
        + Add lane
      </button>

      {message ? (
        <p role="alert" className="text-pool-500 text-sm">
          {message}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3 pt-2 text-sm">
        <button type="button" onClick={onDone} className="text-pool-500">
          Cancel
        </button>
        {/* Blue means action: the one filled thing here saves (H20f). */}
        <button
          type="button"
          data-lanes-save
          disabled={(changed.length === 0 && !reordered) || !complete}
          onClick={commit}
          className="bg-main-900 rounded-full px-5 py-2 font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
