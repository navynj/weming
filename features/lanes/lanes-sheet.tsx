'use client';

import { useRef, useState } from 'react';
import { GripVertical, Trash2 } from 'lucide-react';

import { COLUMN_MAX_WIDTH } from '@/components/ui/column';
import type { MyCategory } from '@/lib/queries/profile';
import type { useOptimisticAction } from '@/lib/use-optimistic-action';

import { deleteLane, reorderLanes, saveLane } from './actions';
import { EmojiInput } from './emoji-input';

/**
 * The lanes sheet: every lane in a row, its icon and its name edited in
 * place and its order changed by dragging the grip (arrow keys on the grip
 * for a keyboard), a Delete per row behind a small confirm, one Save for
 * whatever changed. Opened from the pencil beside the `+` in Home's lane
 * header — the lanes view's own editor now that the Lanes tab has retired
 * (H21 review). A lane with records refuses deletion and says so (H19).
 *
 * Every change shows at once and the action runs behind it (CLAUDE.md, the
 * principle): `apply` is Home's optimistic lane state, and the rows here
 * are derived from it, so a refused delete comes back on its own.
 */
export function LanesSheet({
  categories,
  apply,
  message,
  onClose,
  inline = false,
}: {
  categories: MyCategory[];
  apply: ReturnType<typeof useOptimisticAction<MyCategory[]>>['run'];
  /** The last refusal, from Home's optimistic lane state. */
  message?: string | null;
  /** Closes the sheet; inline, ends an edit (the tab starts the rows afresh). */
  onClose: () => void;
  /** Its rows alone, in the settings sheet (0059). */
  inline?: boolean;
}) {
  // The order the hand has given, and the words it has typed, over the lanes
  // Home holds; a lane that is gone from Home is gone from here too.
  const [order, setOrder] = useState(() => categories.map((lane) => lane.id));
  const [edits, setEdits] = useState<Record<string, { name?: string; icon?: string }>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);

  /** The rows' ids in the hand's order, over the lanes Home holds right now. */
  const idsOf = (given: string[]): string[] => [
    ...given.filter((id) => categories.some((c) => c.id === id)),
    ...categories.filter((c) => !given.includes(c.id)).map((c) => c.id),
  ];
  const ids = idsOf(order);
  const rows = ids.map((id) => {
    const lane = categories.find((c) => c.id === id)!;
    return { id, name: edits[id]?.name ?? lane.name, icon: edits[id]?.icon ?? lane.icon ?? '' };
  });

  const changed = rows.filter((row) => {
    const was = categories.find((lane) => lane.id === row.id)!;
    return row.name.trim() !== was.name || row.icon.trim() !== (was.icon ?? '');
  });
  const complete = rows.every((row) => row.name.trim().length > 0 && row.icon.trim().length > 0);
  const reordered = rows.some((row, index) => row.id !== categories[index]?.id);

  function edit(id: string, patch: Partial<{ name: string; icon: string }>): void {
    setEdits((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  /**
   * Puts the row at `to`, shifting the others; the order the drag reads.
   * Computed from the latest order, never the one the drag began with: a
   * fast drag fires moves faster than the sheet re-renders, and a stale
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
  function remove(id: string): void {
    setConfirming(null);
    apply(
      (current) => current.filter((lane) => lane.id !== id),
      () => deleteLane(id),
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

  function save(): void {
    const next = rows.map((row) => ({ id: row.id, name: row.name.trim(), icon: row.icon.trim() }));
    const toSave = changed.map((row) => ({
      id: row.id,
      name: row.name.trim(),
      icon: row.icon.trim(),
    }));
    const order = rows.map((row) => row.id);
    onClose();
    apply(
      (current) =>
        order.map((id, position) => {
          const lane = current.find((c) => c.id === id)!;
          const edited = next.find((row) => row.id === id)!;
          return { ...lane, name: edited.name, icon: edited.icon, position };
        }),
      async () => {
        for (const row of toSave) {
          const result = await saveLane(row);
          if (!result.ok) return result;
        }
        return reordered ? reorderLanes(order) : { ok: true };
      },
    );
  }

  const body = (
    <>
      <h2 className="text-main-900 text-2xl font-semibold">Lanes</h2>

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
            <input
              value={row.name}
              onChange={(event) => edit(row.id, { name: event.target.value })}
              aria-label="Lane name"
              placeholder="Enter the lane name"
              maxLength={24}
              className="text-ink placeholder:text-pool-500 border-pool-100 min-w-0 flex-1 border-b py-2 text-base outline-none"
            />
            {confirming === row.id ? (
              <span className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => remove(row.id)}
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
                onClick={() => setConfirming(row.id)}
                className="text-pool-500 flex h-8 w-8 shrink-0 items-center justify-center"
              >
                <Trash2 aria-hidden size={14} />
              </button>
            )}
          </li>
        ))}
      </ol>

      {message ? (
        <p role="alert" className="text-pool-500 text-sm">
          {message}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3 pt-2 text-sm">
        <button type="button" onClick={onClose} className="text-pool-500">
          Cancel
        </button>
        {/* Blue means action: the one filled thing here saves (H20f). */}
        <button
          type="button"
          disabled={(changed.length === 0 && !reordered) || !complete}
          onClick={save}
          className="bg-main-900 rounded-full px-5 py-2 font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </>
  );
  // In the settings sheet's Home tab (0059): the rows alone, no sheet of their own.
  if (inline)
    return (
      <div data-lanes-editor className="flex flex-col gap-4">
        {body}
      </div>
    );
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bg-main-900/60 scrim-in absolute inset-0"
      />
      <section
        role="dialog"
        aria-label="Edit lanes"
        data-lanes-sheet
        className={`surface sheet-rise relative mx-auto flex max-h-[calc(100dvh-env(safe-area-inset-top,0px)-2rem)] w-full ${COLUMN_MAX_WIDTH} flex-col overflow-hidden rounded-t-[32px] bg-white`}
      >
        <div
          className="flex min-h-0 flex-col gap-4 overflow-y-auto px-7 pt-8"
          style={{ paddingBottom: 'calc(1.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {body}
        </div>
      </section>
    </div>
  );
}
