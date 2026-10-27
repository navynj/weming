'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { saveLane } from '@/features/lanes/actions';
import type { MyCategory } from '@/lib/queries/profile';
import type { PoolView } from '@/lib/queries/pools';
import { useOptimisticAction } from '@/lib/use-optimistic-action';

import { PoolPhotoField, previewOf, savePoolPhoto, type PoolPhotoChange } from './pool-photo-field';
import { renamePool, setLaneLinks, setPoolInviteAll } from './actions';
import { DeletePool } from './delete-pool';
import { InvitePanel } from './invite-panel';
import { LaneMatch, Switch } from './lane-match';
import { settleMarkers, type Links, type Markers } from './match';
import { PrimaryButton, StepPage } from './step-page';

/**
 * Pool settings (H23): the invite link, the creator's name and photo (0021,
 * 0024), and under Advanced, Connect your lanes (0033): links and their two
 * defaults. Unlinking switches nothing off and moves no record.
 */
export function PoolSettings({
  view,
  categories,
  me,
}: {
  view: PoolView;
  categories: Pick<MyCategory, 'id' | 'name' | 'icon'>[];
  me: string;
}) {
  const router = useRouter();
  const poolId = view.pool.id;
  const initial: Links = Object.fromEntries(
    view.lanes.map((lane) => [
      lane.id,
      view.myLinks.find((l) => l.poolLaneId === lane.id)?.myCategoryId ?? null,
    ]),
  );
  const [links, setLinks] = useState<Links>(initial);
  const keys = view.lanes.map((lane) => lane.id);
  const initialMarkers: Markers = settleMarkers(
    keys,
    initial,
    Object.fromEntries(
      view.myLinks.map((l) => [
        l.poolLaneId,
        { isDefault: l.isDefault, shareByDefault: l.shareByDefault, isHome: l.isHome },
      ]),
    ),
  );
  const [markers, setMarkers] = useState<Markers>(initialMarkers);
  const [advanced, setAdvanced] = useState(false);
  const [mine, setMine] = useState(categories);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The name shows at once; a refusal takes it back and says why.
  const name = useOptimisticAction(view.pool.name);
  const photo = useOptimisticAction<string | null>(view.pool.photo ?? null);
  const inviteAll = useOptimisticAction(view.pool.inviteAllByDefault ?? false);
  const changed =
    JSON.stringify(links) !== JSON.stringify(initial) ||
    JSON.stringify(settleMarkers(keys, links, markers)) !== JSON.stringify(initialMarkers);

  return (
    <StepPage step={null} onBack={() => router.push(`/pool/${poolId}`)}>
      <p className="text-pool-500 text-sm">{name.value}</p>
      <h1 className="text-main-900 mt-1 text-3xl/tight font-semibold">Pool settings</h1>

      {view.pool.ownerId === me ? (
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
                  router.refresh();
                  return { ok: true };
                },
              );
            }
          }}
        />
      ) : null}

      <section className="mt-10">
        <h2 className="text-ink mb-3 font-semibold">Invite link</h2>
        <InvitePanel poolId={poolId} invites={view.invites} />
      </section>

      <section data-settings-invite-all className="mt-10">
        <label className="flex items-center justify-between gap-4">
          <span className="flex flex-col gap-0.5">
            <span className="text-ink text-sm font-medium">
              Invite everyone to new posts by default
            </span>
            <span className="text-pool-500 text-xs">
              Together starts on Everyone when you write in this Pool.
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

      <section data-settings-advanced className="mt-12 flex flex-1 flex-col">
        <button
          type="button"
          data-settings-advanced-toggle
          aria-expanded={advanced}
          onClick={() => setAdvanced((open) => !open)}
          className="text-ink flex items-center justify-between font-semibold"
        >
          Advanced
          <span aria-hidden className="text-pool-500 text-sm font-normal">
            {advanced ? 'Hide' : 'Show'}
          </span>
        </button>
        {advanced ? (
          <div data-settings-links className="mt-6 flex flex-1 flex-col">
            <LaneMatch
              poolName={view.pool.name}
              lanes={view.lanes.map((lane) => ({
                key: lane.id,
                name: lane.name,
                icon: lane.icon,
                description: lane.description,
              }))}
              categories={mine}
              links={links}
              onLinksChange={setLinks}
              markers={markers}
              onMarkersChange={setMarkers}
              onCreateLane={async (lane) => {
                const made = await saveLane({ id: null, ...lane });
                if (!made.ok || !made.id) return { message: made.ok ? 'Try again.' : made.message };
                setMine((current) => [
                  ...current,
                  { id: made.id!, name: lane.name, icon: lane.icon },
                ]);
                return made.id;
              }}
              footer={
                message ? (
                  <p role="alert" className="text-pool-500 text-sm">
                    {message}
                  </p>
                ) : null
              }
              action={
                <PrimaryButton
                  disabled={busy || !changed}
                  onClick={async () => {
                    setBusy(true);
                    setMessage(null);
                    const settled = settleMarkers(keys, links, markers);
                    const done = await setLaneLinks(
                      poolId,
                      view.lanes.map((lane) => ({
                        poolLaneId: lane.id,
                        myCategoryId: links[lane.id] ?? null,
                        ...(settled[lane.id] ?? {}),
                      })),
                    );
                    setBusy(false);
                    if (!done.ok) return setMessage(done.message);
                    router.push(`/pool/${poolId}`);
                  }}
                >
                  {busy ? 'Saving…' : 'Save lane links'}
                </PrimaryButton>
              }
            />
          </div>
        ) : null}
      </section>

      {/* The creator alone deletes the pool (0015). */}
      {view.pool.ownerId === me ? (
        <section className="border-pool-100 mt-12 border-t pt-6">
          <DeletePool poolId={poolId} poolName={view.pool.name} />
        </section>
      ) : null}
    </StepPage>
  );
}

/** The pool's name, the creator's to change (0021): a field and its own Save. */
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
    <section data-settings-name className="mt-10">
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
