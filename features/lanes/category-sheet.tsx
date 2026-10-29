'use client';

import { useState, useTransition } from 'react';

import type { MyCategory } from '@/lib/queries/profile';
import type { useOptimisticAction } from '@/lib/use-optimistic-action';

import { deleteLane, saveLane } from './actions';
import { EmojiInput } from './emoji-input';

/**
 * What a lane gets when its author never picks a glyph. Shown as a
 * placeholder rather than typed in: a prefilled field is a choice the author
 * has to undo, and an emoji they did not pick reads as one they did.
 */
const DEFAULT_ICON = '🌊';

/**
 * A lane's own controls, opened from its column header: name, icon, and
 * delete while it is still empty.
 *
 * The header's other half is a mapping dashboard — where this lane flows, and
 * into which pool's lane. That needs pools to flow into, so it arrives with
 * P2; nothing here anticipates it.
 */
export function CategorySheet({
  category,
  apply,
  onClose,
}: {
  /** Null opens the same sheet on a lane that does not exist yet. */
  category: MyCategory | null;
  /** Home's optimistic lane state: with it, a new lane shows at once (CLAUDE.md, the principle). */
  apply?: ReturnType<typeof useOptimisticAction<MyCategory[]>>['run'];
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The lane actions revalidate: the page comes back with their answer.
  function done(): void {
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bg-ink/40 scrim-in absolute inset-0"
      />

      <section
        role="dialog"
        aria-label={category ? 'Edit this lane' : 'New lane'}
        className="surface sheet-rise relative flex flex-col gap-4 rounded-t-3xl bg-white px-5 pt-5"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center gap-3">
          <EmojiInput value={icon} onChange={setIcon} label="Icon" placeholder={DEFAULT_ICON} />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Lane name"
            placeholder="Enter the lane name"
            maxLength={24}
            className="text-ink placeholder:text-pool-500 min-w-0 flex-1 text-base outline-none"
          />
        </div>

        {message ? (
          <p role="alert" className="text-pool-500 text-sm">
            {message}
          </p>
        ) : null}

        <div className="border-pool-200 flex items-center gap-3 border-t pt-3">
          {category ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteLane(category.id);
                  if (result.ok) done();
                  else setMessage(result.message);
                })
              }
              className="text-pool-500 text-sm disabled:opacity-50"
            >
              Delete
            </button>
          ) : null}

          <span className="flex-1" />

          <button
            type="button"
            disabled={pending || name.trim().length === 0}
            onClick={() => {
              const lane = {
                id: category?.id ?? null,
                name: name.trim(),
                icon: icon.trim() || DEFAULT_ICON,
              };
              if (apply && !category) {
                onClose();
                apply(
                  (current) => [
                    ...current,
                    {
                      id: `optimistic-${Date.now()}`,
                      user_id: '',
                      name: lane.name,
                      icon: lane.icon,
                      default_mode: 'drop',
                      position: current.length,
                      created_at: new Date().toISOString(),
                    },
                  ],
                  () => saveLane(lane),
                );
                return;
              }
              startTransition(async () => {
                const result = await saveLane(lane);
                if (result.ok) done();
                else setMessage(result.message);
              });
            }}
            className="bg-main-900 rounded-full px-6 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {category ? 'Save' : 'Add lane'}
          </button>
        </div>
      </section>
    </div>
  );
}
