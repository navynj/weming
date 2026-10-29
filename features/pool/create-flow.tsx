'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { welcomePool } from '@/features/notifications/welcome';

import { createPool } from './actions';
import { LaneEditor, POOL_LANE_PRESET, type DraftLane } from './lane-editor';
import { holdFailedPhoto } from './photo-retry';
import { PoolPhotoField, savePoolPhoto, type PoolPhotoChange } from './pool-photo-field';
import { PrimaryButton, StepPage } from './step-page';

/**
 * "Open a new Pool" (1c): one screen — its photo and name, and its lanes,
 * five to start with (`POOL_LANE_PRESET`) — and one button, which opens the pool, its lanes and my
 * membership as one act (`create_pool`), then goes to the pool. No lane of
 * mine is connected: a record written there shows in the pool's column on
 * my Home until I file it (H45). Every pool is private (`create_pool`
 * writes it), so there is no visibility to choose; the column stays for
 * open pools later.
 *
 * On a wide screen the photo and name sit left of the lanes.
 *
 * The pool's id comes from the database, so this one add waits on its round
 * trip: the button says so while it does.
 */
export function CreateFlow() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [lanes, setLanes] = useState<DraftLane[]>(POOL_LANE_PRESET);
  const [photo, setPhoto] = useState<PoolPhotoChange>({ kind: 'keep' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ready = name.trim().length > 0 && lanes.length > 0;

  const create = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    const made = await createPool({
      name: name.trim(),
      lanes: lanes.map((lane) => ({
        name: lane.name,
        icon: lane.icon,
        description: lane.description,
      })),
    });
    if (!made.ok) {
      setMessage(made.message);
      setBusy(false);
      return;
    }
    // The photo needs the pool's id, so it follows the pool (0024). A photo
    // that will not save is held for the new pool's toast to try again.
    const photoFailed = await savePoolPhoto(made.id, photo);
    if (photoFailed) {
      console.error(`[during] pool photo not saved: ${photoFailed}`);
      holdFailedPhoto(made.id, photo);
    }
    // The pool's first screen greets me with its notifications (review).
    router.replace(welcomePool(made.id));
  };

  return (
    <StepPage step={null} wide onBack={() => router.back()}>
      <div className="flex min-h-0 flex-1 flex-col">
        <section data-create-step="1" className="flex min-h-0 flex-1 flex-col">
          <h1 className="text-main-900 text-3xl/tight font-semibold">Open a new Pool</h1>
          <p className="text-pool-500 mt-3 text-sm">A pool for the people you keep records with.</p>

          <div className="mt-10 flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:gap-12">
            <div className="flex items-start gap-4">
              {/* The pool's photo (0024): the tile, the letters until one is picked. */}
              <PoolPhotoField name={name} current={null} change={photo} onChange={setPhoto} />
              <label className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-pool-500 text-xs">Pool name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                  data-pool-name
                  className="border-pool-200 text-ink focus:border-main-900 h-16 rounded-2xl border px-5 text-lg outline-none"
                />
              </label>
            </div>

            <div>
              <span className="text-pool-500 text-xs">Pool lanes</span>
              <LaneEditor lanes={lanes} onChange={setLanes} />
            </div>
          </div>

          <div className="mt-auto flex flex-col items-center gap-3 pt-10">
            {message ? (
              <p role="alert" className="text-pool-500 text-sm">
                {message}
              </p>
            ) : null}
            <PrimaryButton disabled={busy || !ready} onClick={() => void create()}>
              {busy ? 'Opening the Pool…' : 'Open the Pool'}
            </PrimaryButton>
          </div>
        </section>
      </div>
    </StepPage>
  );
}
