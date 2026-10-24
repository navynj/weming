'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { saveLane } from '@/features/lanes/actions';
import type { MyCategory } from '@/lib/queries/profile';

import { createPool } from './actions';
import { LaneMatch } from './lane-match';
import { LaneEditor, type DraftLane } from './lane-editor';
import {
  joinLabel,
  linkedCount,
  prefillLinks,
  settleDirections,
  type Directions,
  type Links,
} from './match';
import { holdFailedPhoto } from './photo-retry';
import { PoolPhotoField, savePoolPhoto, type PoolPhotoChange } from './pool-photo-field';
import { PrimaryButton, StepPage } from './step-page';

/**
 * "Open a new Pool" (1c, then 1d): step 1 names the pool, its visibility
 * and its lanes; step 2 matches them to mine. Nothing is written
 * until the last button, which opens the pool, its lanes, my membership and
 * my links as one act (`create_pool`), then goes to the pool.
 *
 * The pool's id comes from the database, so this one add waits on its round
 * trip: the button says so while it does.
 */
export function CreateFlow({ categories }: { categories: MyCategory[] }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [lanes, setLanes] = useState<DraftLane[]>([]);
  const [mine, setMine] = useState<Pick<MyCategory, 'id' | 'name' | 'icon'>[]>(categories);
  const [chosen, setChosen] = useState<Links>({});
  const [directions, setDirections] = useState<Directions>({});
  const [includeHistory, setIncludeHistory] = useState(false);
  const [photo, setPhoto] = useState<PoolPhotoChange>({ kind: 'keep' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // A name match suggests a link (prefillLinks) wherever I have not chosen
  // yet — "Don't connect" is a choice too — so a wide screen's live step 2
  // follows the lanes as they are added (review).
  const keys = lanes.map((lane) => lane.key);
  const links: Links = Object.fromEntries(
    keys.map((key) => [
      key,
      key in chosen ? chosen[key] : (prefillLinks(lanes, mine)[key] ?? null),
    ]),
  );
  const ready = name.trim().length > 0 && lanes.length > 0;
  const count = linkedCount(links);

  const create = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    const made = await createPool({
      name: name.trim(),
      lanes: lanes.map((lane) => ({
        name: lane.name,
        icon: lane.icon,
        description: lane.description,
        myCategoryId: links[lane.key] ?? null,
        direction: settleDirections(keys, links, directions)[lane.key],
      })),
      includeHistory,
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
    // A phone walks the two steps; a wide screen sets them side by side, step 1
    // on the left and step 2 on the right (review).
    <StepPage step={`${step} / 2`} wide onBack={() => (step === 2 ? setStep(1) : router.back())}>
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-2 lg:items-start lg:gap-16">
        <section
          data-create-step="1"
          className={`${step === 2 ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col lg:flex`}
        >
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
            <span className="text-pool-500 text-xs">
              Pool lanes, matched to your lanes
              <span className="lg:hidden"> in the next step</span>
              <span className="hidden lg:inline"> at the right</span>
            </span>
            <LaneEditor lanes={lanes} onChange={setLanes} />
          </div>

          {/* A phone moves on; a wide screen already shows step 2 beside this. */}
          <div className="mt-auto pt-10 lg:hidden">
            <PrimaryButton disabled={!ready} onClick={() => setStep(2)}>
              Next: match lanes
            </PrimaryButton>
          </div>
        </section>

        <section
          data-create-step="2"
          className={`${step === 1 ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col lg:flex`}
        >
          <LaneMatch
            poolName={name}
            lanes={lanes}
            categories={mine}
            links={links}
            onLinksChange={(next) => setChosen((current) => ({ ...current, ...next }))}
            directions={directions}
            onDirectionsChange={setDirections}
            includeHistory={includeHistory}
            onIncludeHistoryChange={setIncludeHistory}
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
              <>
                {message ? (
                  <p role="alert" className="text-pool-500 text-sm">
                    {message}
                  </p>
                ) : null}
                <p className="text-pool-500 text-xs">
                  You can change this anytime in Pool settings.
                </p>
              </>
            }
            action={
              <PrimaryButton disabled={busy || !ready} onClick={() => void create()}>
                {busy ? 'Opening the Pool…' : joinLabel(count)}
              </PrimaryButton>
            }
          />
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
