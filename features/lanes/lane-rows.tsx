'use client';

import { useLayoutEffect, useRef, useState } from 'react';
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

/** One lane as it is written; a lane added here has no id yet. */
export type LaneFields = {
  id: string | null;
  name: string;
  icon: string;
  description: string | null;
};

/** A row added in this round, until its first save gives it a real id. */
const DRAFT = 'draft:';
/** Typing rests this long before the name is saved; leaving the field saves at once. */
const TYPING_REST_MS = 800;
/** The toast once a change has saved: there is no Save button to say so. */
const SAVED = 'Saved';

type Words = { name?: string; icon?: string; description?: string };

/**
 * The lane rows (H42b): every lane in a row, its icon and its name edited in
 * place and its order changed by dragging the grip (arrow keys on the grip
 * for a keyboard), "+ Add lane" for a new row, and, where a lane may go, a
 * Delete per row behind a small confirm. Home's lanes and a pool's use the
 * same rows; the place gives the writes.
 *
 * No Save (review): each change is written as it is made — an icon when it
 * is picked, a name when typing rests or the field is left, the order when
 * the row is let go, a delete when it is confirmed — and a toast says it
 * saved. Every change shows at once and the action runs behind it
 * (CLAUDE.md, the principle): `apply` is the place's optimistic lane state,
 * and the rows are derived from it, so a refused write comes back on its own.
 */
export function LaneRows<T extends EditableLane>({
  lanes,
  apply,
  message,
  save,
  reorder,
  remove,
  draft,
  iconRequired,
  describe = false,
  maxName,
}: {
  lanes: T[];
  apply: (
    updater: (current: T[]) => T[],
    work: () => Promise<ActionOutcome>,
    saved?: string,
  ) => void;
  /** The last refusal, from the place's optimistic lane state. */
  message?: string | null;
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
  // What the hand has typed and not yet saved, over the lanes the place holds.
  const [edits, setEdits] = useState<Record<string, Words>>({});
  // Rows added and not yet written: they need a name (and an icon, on Home) first.
  const [added, setAdded] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  // The order while a row is held; the place's order the rest of the time.
  const [held, setHeld] = useState<{ id: string; order: string[] } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const typing = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Where the held row is drawn: the pointer, less where it took the row.
  const drag = useRef<{ id: string; y: number; grab: number; shift: number } | null>(null);

  const placeIds = [
    ...lanes.map((lane) => lane.id),
    ...added.filter((id) => !lanes.some((l) => l.id === id)),
  ];
  const ids = held
    ? [
        ...held.order.filter((id) => placeIds.includes(id)),
        ...placeIds.filter((id) => !held.order.includes(id)),
      ]
    : placeIds;
  const rowOf = (id: string) => {
    const lane = lanes.find((l) => l.id === id);
    return {
      id,
      name: edits[id]?.name ?? lane?.name ?? '',
      icon: edits[id]?.icon ?? lane?.icon ?? '',
      description: edits[id]?.description ?? lane?.description ?? '',
    };
  };
  const rows = ids.map(rowOf);

  /** Draws the held row under the pointer, from where its slot now is. */
  function follow(): void {
    // From the ref, not state: a move's handler holds the render the drag began in.
    const at = drag.current;
    const el = at && list.current?.querySelector<HTMLElement>(`[data-lane-row="${at.id}"]`);
    if (!at || !el) return;
    const slot = el.getBoundingClientRect().top - at.shift;
    at.shift = at.y - at.grab - slot;
    el.style.transform = `translateY(${at.shift}px)`;
  }

  // The held row follows the pointer: re-placed after every render, since a
  // reorder moves its slot under it.
  useLayoutEffect(() => {
    if (held) follow();
  });

  function edit(id: string, patch: Words): void {
    setEdits((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  /** A name or a line typed: saved once typing rests, or at once when the field is left. */
  function type(id: string, patch: Words): void {
    edit(id, patch);
    clearTimeout(typing.current[id]);
    typing.current[id] = setTimeout(() => commitRow(id, patch), TYPING_REST_MS);
  }

  function leave(id: string): void {
    clearTimeout(typing.current[id]);
    commitRow(id);
  }

  /**
   * Writes one row as it stands, if it changed and is complete: a new row
   * becomes a lane at the end, an existing one takes its new words.
   * `latest` is what was just typed, which state may not hold yet.
   */
  function commitRow(id: string, latest: Words = {}): void {
    delete typing.current[id];
    const words = { ...edits[id], ...latest };
    const lane = lanes.find((l) => l.id === id);
    const row = {
      name: (words.name ?? lane?.name ?? '').trim(),
      icon: (words.icon ?? lane?.icon ?? '').trim(),
      description: (words.description ?? lane?.description ?? '').trim(),
    };
    // A new row on its way to the database waits for its real id.
    if (id.startsWith(DRAFT) && lane) return;
    const fresh = id.startsWith(DRAFT);
    if (!fresh && !lane) return;
    if (row.name.length === 0 || (iconRequired && row.icon.length === 0)) return;
    if (
      lane &&
      row.name === lane.name &&
      row.icon === (lane.icon ?? '') &&
      (!describe || row.description === (lane.description ?? ''))
    ) {
      return;
    }
    const fields: LaneFields = {
      id: fresh ? null : id,
      name: row.name,
      icon: row.icon,
      description: row.description || null,
    };
    // The optimistic lanes hold it from here: the typed words are theirs now.
    setEdits((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== id)));
    if (fresh) setAdded((current) => current.filter((a) => a !== id));
    const sequence = ids;
    apply(
      (current) => {
        if (!fresh) {
          return current.map((c) =>
            c.id === id
              ? {
                  ...c,
                  name: fields.name,
                  icon: fields.icon || null,
                  ...(describe ? { description: fields.description } : {}),
                }
              : c,
          );
        }
        return [...current, draft({ ...fields, id }, current.length)];
      },
      async () => {
        const result = await save(fields);
        if (!result.ok) return result;
        if (!fresh) return { ok: true };
        // A new lane is named by the database: the order then names it too.
        if (!result.id) return { ok: false, message: 'That lane was not added. Try again.' };
        const real = sequence
          .filter((s) => !s.startsWith(DRAFT) || s === id)
          .map((s) => (s === id ? result.id! : s));
        return reorder(real);
      },
      SAVED,
    );
  }

  /** An order the hand has settled on, written as it shows. Rows not yet written keep their place at the end. */
  function commitOrder(order: string[]): void {
    const saved = order.filter((id) => lanes.some((l) => l.id === id));
    if (saved.every((id, index) => lanes[index]?.id === id)) return;
    apply(
      (current) =>
        saved.flatMap((id, position) => {
          const lane = current.find((c) => c.id === id);
          return lane ? [{ ...lane, position }] : [];
        }),
      () => reorder(saved),
      SAVED,
    );
  }

  /** The keyboard's move: one step, written at once. */
  function step(id: string, by: number): void {
    const from = ids.indexOf(id);
    const to = from + by;
    if (from === -1 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, id);
    commitOrder(next);
  }

  function add(): void {
    setAdded((current) => [...current, `${DRAFT}${crypto.randomUUID()}`]);
  }

  /** Gone at once; a lane with records comes back with the refusal (H19). */
  function drop(id: string): void {
    setConfirming(null);
    // A new row is not written yet, or is being written: nothing to delete there.
    if (id.startsWith(DRAFT)) {
      setAdded((current) => current.filter((a) => a !== id));
      return;
    }
    if (!remove) return;
    apply(
      (current) => current.filter((lane) => lane.id !== id),
      () => remove(id),
      'Lane deleted',
    );
  }

  /**
   * Dragging: the grip takes the pointer, the row follows it, and as it
   * crosses another row's middle that row steps aside. Moves are read on
   * the window, not the grip: a reorder moves the row in the document, which
   * would drop a capture on the grip and leave the row behind. Touch and
   * mouse alike, through pointer events.
   */
  function dragFrom(id: string, event: React.PointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    // The grip's own: the sheet must not take this press for its drag down.
    event.stopPropagation();
    const row = event.currentTarget.closest<HTMLElement>('[data-lane-row]');
    if (!row) return;
    const pointer = event.pointerId;
    drag.current = {
      id,
      y: event.clientY,
      grab: event.clientY - row.getBoundingClientRect().top,
      shift: 0,
    };
    let order = ids;
    setHeld({ id, order });

    /** Where the pointer puts the held row: after every other row whose middle it has passed. */
    const slotAt = (y: number): number => {
      const others = [
        ...(list.current?.querySelectorAll<HTMLElement>('[data-lane-row]') ?? []),
      ].filter((el) => el.dataset.laneRow !== id);
      return others.filter((el) => {
        const box = el.getBoundingClientRect();
        return y > box.top + box.height / 2;
      }).length;
    };
    const onMove = (move: PointerEvent): void => {
      if (move.pointerId !== pointer || !drag.current) return;
      drag.current.y = move.clientY;
      const to = slotAt(move.clientY);
      const from = order.indexOf(id);
      if (to !== from) {
        const next = order.filter((o) => o !== id);
        next.splice(to, 0, id);
        order = next;
        setHeld({ id, order });
      }
      follow();
    };
    const onUp = (up: PointerEvent): void => {
      if (up.pointerId !== pointer) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      row.style.transform = '';
      drag.current = null;
      setHeld(null);
      commitOrder(order);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  return (
    <div data-lanes-editor className="flex flex-col gap-4">
      <ol ref={list} className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            data-lane-row={row.id}
            data-dragging={held?.id === row.id ? '' : undefined}
            // Held, it is drawn where the pointer is, not eased toward it.
            className={`relative flex items-center gap-3 bg-white ${
              held?.id === row.id
                ? 'z-10 opacity-80'
                : 'transition-opacity duration-100 motion-reduce:transition-none'
            }`}
          >
            <button
              type="button"
              aria-label={`Move ${row.name || 'this lane'}`}
              data-lane-grip
              onPointerDown={(event) => dragFrom(row.id, event)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  step(row.id, -1);
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  step(row.id, 1);
                }
              }}
              className="text-pool-500 flex h-10 w-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
            >
              <GripVertical aria-hidden size={16} />
            </button>
            <EmojiInput
              value={row.icon}
              onChange={(icon) => {
                edit(row.id, { icon });
                commitRow(row.id, { icon });
              }}
              label={`Icon for ${row.name || 'this lane'}`}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <input
                value={row.name}
                onChange={(event) => type(row.id, { name: event.target.value })}
                onBlur={() => leave(row.id)}
                onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
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
                  onChange={(event) => type(row.id, { description: event.target.value })}
                  onBlur={() => leave(row.id)}
                  onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
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
                onClick={() => (added.includes(row.id) ? drop(row.id) : setConfirming(row.id))}
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
    </div>
  );
}
