'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { createPool } from './actions';
import { LaneEditor, type DraftLane } from './lane-editor';
import { holdFailedPhoto } from './photo-retry';
import { PoolPhotoField, savePoolPhoto, type PoolPhotoChange } from './pool-photo-field';
import { PrimaryButton, StepPage } from './step-page';

/**
 * "Open a new Pool" (1c): one screen — its photo and name, its visibility
 * and its lanes — and one button, which opens the pool, its lanes and my
 * membership as one act (`create_pool`), then goes to the pool. No lane of
 * mine is connected here: links are advanced only, in the pool's settings
 * (0033).
 *
 * The pool's id comes from the database, so this one add waits on its round
 * trip: the button says so while it does.
 */
export function CreateFlow() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [lanes, setLanes] = useState<DraftLane[]>([]);
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
    router.replace(`/pool/${made.id}`);
  };

  return (
    <StepPage step={null} onBack={() => router.back()}>
      <div className="flex min-h-0 flex-1 flex-col">
        <section data-create-step="1" className="flex min-h-0 flex-1 flex-col">
          <h1 className="text-main-900 text-3xl/tight font-semibold">Open a new Pool</h1>
          <p className="text-pool-500 mt-3 text-sm">A pool for the people you keep records with.</p>

          <div className="mt-10 flex items-start gap-4">
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

          <fieldset className="mt-8 flex flex-col gap-3">
            <legend className="text-pool-500 mb-3 text-xs">Visibility</legend>
            <VisibilityCard
              title="Private"
              detail="Only people with the invite link can join"
              selected
            />
            <VisibilityCard
              title="Open"
              detail="Anyone can find and join"
              note="Coming later"
              disabled
            />
          </fieldset>

          <div className="mt-8">
            <span className="text-pool-500 text-xs">Pool lanes</span>
            <LaneEditor lanes={lanes} onChange={setLanes} />
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

/** A visibility card (1c): a title, a line, and a radio at the right. */
function VisibilityCard({
  title,
  detail,
  note,
  selected = false,
  disabled = false,
}: {
  title: string;
  detail: string;
  note?: string;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      data-visibility={title.toLowerCase()}
      className={`flex items-center justify-between gap-4 rounded-2xl px-5 py-5 ${
        selected ? 'border-main-900 border-2' : 'border-pool-200 border'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span className="flex flex-col gap-1">
        <span className={`font-semibold ${selected ? 'text-main-900' : 'text-ink'}`}>
          {title}
          {note ? <span className="text-pool-500 ml-2 text-[10px] font-normal">{note}</span> : null}
        </span>
        <span className="text-pool-500 text-xs">{detail}</span>
      </span>
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          selected ? 'border-main-900 border-2' : 'border-pool-200 border'
        }`}
      >
        {selected ? <span className="bg-main-900 h-3 w-3 rounded-full" /> : null}
      </span>
    </div>
  );
}
