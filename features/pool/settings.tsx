'use client';

import { useState } from 'react';

import { ThemePicker } from '@/features/people/theme-picker';
import { SettingsSheet } from '@/features/settings/settings-sheet';
import type { PoolView } from '@/lib/queries/pools';
import { useOptimisticAction } from '@/lib/use-optimistic-action';

import { PoolPhotoField, previewOf, savePoolPhoto, type PoolPhotoChange } from './pool-photo-field';
import { renamePool, setPoolInviteAll, setPoolOnHome } from './actions';
import { LeaveSheet } from './members-sheet';
import { OwnerSection } from './owner-settings';
import { Switch } from './switch';
import { PoolLanesSheet } from './pool-lanes-sheet';

/**
 * A pool's settings (0059): a sheet over the pool from the header's gear,
 * its tabs drawn at once from the pool the screen already holds. Pool: its
 * photo and name, and its lanes — each any current member's. Theme: the
 * pool's colour and mine there. Advanced: Show on my Home, Invite everyone,
 * then Leave, or the owner's acts (0063: transfer, Allow back, Delete only
 * as the one member left; the owner cannot leave). Lane links retired, H45. The
 * invite link is the header's "+"; notifications are the bell's.
 */
export function PoolSettingsSheet({ view, me }: { view: PoolView; me: string }) {
  return (
    <SettingsSheet
      title="Pool settings"
      tabs={[
        { key: 'pool', label: 'Pool', render: () => <PoolTab view={view} /> },
        { key: 'theme', label: 'Theme', render: () => <ThemePicker /> },
        { key: 'advanced', label: 'Advanced', render: () => <AdvancedTab view={view} me={me} /> },
      ]}
    />
  );
}

function PoolTab({ view }: { view: PoolView }) {
  const poolId = view.pool.id;
  // The name shows at once; a refusal takes it back and says why.
  const name = useOptimisticAction(view.pool.name);
  const photo = useOptimisticAction<string | null>(view.pool.photo ?? null);
  // On a desktop two columns (review): the photo and name narrow at the
  // left, the lanes wide at the right; a phone's one column.
  return (
    <div
      data-settings-pool
      className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12"
    >
      <PoolName
        name={name.value}
        photo={photo.value}
        message={name.message ?? photo.message}
        onSave={(next, change) => {
          if (next !== name.value) {
            name.run(
              () => next,
              () => renamePool(poolId, next),
            );
          }
          if (change.kind !== 'keep') {
            // Shown at once; the upload and the row run behind it (0024).
            photo.run(
              () => previewOf(change, photo.value),
              async () => {
                const failed = await savePoolPhoto(poolId, change);
                if (failed) return { ok: false, message: failed };
                return { ok: true };
              },
            );
          }
        }}
      />

      <section data-settings-lanes className="mt-10 lg:mt-0 lg:min-w-0">
        <h2 className="text-ink mb-3 font-semibold">Lanes</h2>
        <PoolLanesSheet poolId={poolId} lanes={view.lanes} />
      </section>
    </div>
  );
}

function AdvancedTab({ view, me }: { view: PoolView; me: string }) {
  const poolId = view.pool.id;
  const [leaving, setLeaving] = useState(false);
  const inviteAll = useOptimisticAction(view.pool.inviteAllByDefault ?? false);
  const onHome = useOptimisticAction(view.pool.myOnHome ?? true);

  return (
    <>
      {/* Mine alone (0039): what I wrote here, on my Home or not. Nothing moves. */}
      <section data-settings-on-home>
        <label className="flex items-center justify-between gap-4">
          <span className="flex flex-col gap-0.5">
            <span className="text-ink text-sm font-medium">Show on my Home</span>
            <span className="text-pool-500 text-xs">
              What you write in this Pool also shows on your Home. Only you see this choice.
            </span>
          </span>
          <Switch
            on={onHome.value}
            label="Show on my Home"
            onChange={(on) =>
              onHome.run(
                () => on,
                () => setPoolOnHome(poolId, on),
                'Saved',
              )
            }
          />
        </label>
        {onHome.message ? (
          <p role="alert" className="text-pool-500 mt-2 text-xs">
            {onHome.message}
          </p>
        ) : null}
      </section>

      <section data-settings-invite-all className="mt-6">
        <label className="flex items-center justify-between gap-4">
          <span className="flex flex-col gap-0.5">
            <span className="text-ink text-sm font-medium">
              Invite everyone to new posts by default
            </span>
            <span className="text-pool-500 text-xs">
              New posts here start with everyone in the Pool invited. This is the Pool’s setting:
              changing it changes it for every member.
            </span>
          </span>
          <Switch
            on={inviteAll.value}
            label="Invite everyone to new posts by default"
            onChange={(on) =>
              inviteAll.run(
                () => on,
                () => setPoolInviteAll(poolId, on),
                'Saved',
              )
            }
          />
        </label>
        {inviteAll.message ? (
          <p role="alert" className="text-pool-500 mt-2 text-xs">
            {inviteAll.message}
          </p>
        ) : null}
      </section>
      {/* The owner hands on, lets back and deletes (0063); a member leaves here instead. */}
      <section className="border-pool-100 mt-12 border-t pt-6">
        {view.pool.ownerId === me ? (
          <OwnerSection view={view} me={me} />
        ) : (
          <button
            type="button"
            data-settings-leave-pool
            onClick={() => setLeaving(true)}
            className="text-pool-500 self-start py-2 text-sm"
          >
            Leave Pool
          </button>
        )}
      </section>
      {leaving ? <LeaveSheet poolId={poolId} onClose={() => setLeaving(false)} /> : null}
    </>
  );
}

/** The pool's photo and name (0021, 0024), any current member's to change (0059): a field and its own Save. */
function PoolName({
  name,
  photo,
  message,
  onSave,
}: {
  name: string;
  /** The pool's photo now (a signed URL, or a preview of one just saved). */
  photo: string | null;
  message: string | null;
  onSave: (name: string, photo: PoolPhotoChange) => void;
}) {
  const [draft, setDraft] = useState(name);
  const [change, setChange] = useState<PoolPhotoChange>({ kind: 'keep' });
  const next = draft.trim();
  const changed = (next !== '' && next !== name) || change.kind !== 'keep';
  return (
    <section data-settings-name>
      <h2 className="text-ink mb-3 font-semibold">Photo and name</h2>
      <div className="mb-4">
        <PoolPhotoField name={draft || name} current={photo} change={change} onChange={setChange} />
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={60}
          aria-label="Pool name"
          className="border-pool-200 text-ink h-12 min-w-0 flex-1 rounded-xl border px-3 outline-none"
        />
        <button
          type="button"
          data-save-name
          disabled={!next || !changed}
          onClick={() => {
            onSave(next, change);
            setChange({ kind: 'keep' });
          }}
          className="bg-main-900 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>
      {message ? (
        <p role="alert" className="text-pool-500 mt-2 text-xs">
          {message}
        </p>
      ) : null}
    </section>
  );
}
