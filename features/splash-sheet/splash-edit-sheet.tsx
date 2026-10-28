'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { COLUMN_MAX_WIDTH } from '@/components/ui/column';
import { AnnotationControl } from '@/features/input-sheet/annotation-control';
import { annotationVerdict, type Annotation } from '@/features/input-sheet/draft';
import { useInputSheet, type PendingEdit } from '@/features/input-sheet/sheet-provider';
import { EmojiInput } from '@/features/lanes/emoji-input';
import type { PoolScope } from '@/features/pool/compose-scope';

import type { Conversion } from './conversion';
import { loadSplashEdit, saveSplashEdit, type SplashEditState } from './edit-actions';
import { useEditLanes } from './edit-lanes';
import { SHEET_MAX_HEIGHT, type SheetContext } from './splash-sheet';

type Loaded = Extract<SplashEditState, { ok: true }>;

/** How long an edit stays applied over the server's rows before the re-read has surely landed. */
const SETTLE_MS = 2500;

/**
 * The compose sheet in edit mode (review), from the pencil on the top card
 * or a splash's page: title, icon, dates, lane and Audience for my own
 * record; title, icon and dates for my pool record (its pool fixed); title and
 * icon for a joint splash. Ripples are edited on the splash's page, not
 * here. Opened from a pool, its lanes are that pool's with Together; from
 * Home, mine (0022, edit-lanes.tsx). Save shows the change at once
 * everywhere the splash is drawn — a conversion included — and the save runs
 * behind it; a refusal takes it back and says why.
 */
export function SplashEditSheet({
  splashId,
  context,
  pool = null,
  onClose,
}: {
  splashId: string;
  context: SheetContext;
  /** The pool screen it was opened from, or null from Home. */
  pool?: PoolScope | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { markEdited, clearEdited, dropFailed } = useInputSheet();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadSplashEdit(splashId)
      .then((state) => {
        if (!live) return;
        if (state.ok) setLoaded(state);
        else setMessage(state.message);
      })
      .catch(() => {
        if (live) setMessage('This splash did not open. Try again.');
      });
    return () => {
      live = false;
    };
  }, [splashId]);

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
        aria-label="Edit splash"
        data-edit-sheet
        className={`sheet-rise relative mx-auto flex w-full ${COLUMN_MAX_WIDTH} ${SHEET_MAX_HEIGHT} flex-col overflow-hidden rounded-t-[32px] bg-white`}
      >
        <div
          className="flex min-h-0 flex-col overflow-y-auto px-7 pt-8"
          style={{ paddingBottom: 'calc(1.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {loaded ? (
            <EditForm
              initial={loaded}
              context={context}
              pool={pool}
              onCancel={onClose}
              onSave={(edit) => {
                // Shown at once everywhere the splash is drawn (CLAUDE.md, the
                // principle) — a move or a change of kind too (0020, 0022).
                markEdited(splashId, {
                  title: edit.title,
                  icon: edit.icon,
                  declaredLaneId: edit.kind === 'mine' ? edit.declaredLaneId : undefined,
                  ...pendingFor(edit.conversion, loaded),
                });
                onClose();
                void saveSplashEdit({ id: splashId, ...edit }).then((done) => {
                  if (!done.ok) {
                    clearEdited(splashId);
                    dropFailed(done.message);
                    return;
                  }
                  router.refresh();
                  window.setTimeout(() => clearEdited(splashId), SETTLE_MS);
                });
              }}
            />
          ) : (
            <p className="text-pool-500 py-6 text-sm">{message ?? 'Opening…'}</p>
          )}
        </div>
      </section>
    </div>
  );
}

type Edit = {
  kind: Exclude<Loaded['kind'], 'theirs'>;
  title: string;
  icon: string | null;
  declaredStart: string | null;
  declaredEnd: string | null;
  declaredLaneId: string | null;
  share: {
    poolId: string;
    on: boolean;
    poolLaneId: string | null;
    together?: { everyone: boolean; picked: string[] };
  }[];
  /** My pool record: With in its pool, when it changed (0035). */
  ownTogether: { everyone: boolean; picked: string[] } | null;
  /** A joint record I made: its whole With, when it changed (0043). */
  jointTogether: { everyone: boolean; picked: string[] } | null;
  /** A joint record: members added in Together (0033), and Everyone turned on. */
  invite: string[];
  /** The description when it changed (0037); empty takes it off. */
  description?: string;
  inviteEveryone: boolean;
  poolId: string | null;
  /** Only when it moved: a pool's own splash's new pool lane (0020). */
  poolLaneId: string | null;
  /** A change of kind or lane (0022). */
  conversion: Conversion;
};

/** What a conversion looks like before the server has it: kind, lane, pool lane. */
function pendingFor(conversion: Conversion, loaded: Loaded): Partial<PendingEdit> {
  const poolLane = (id: string | null) => {
    const lane = id ? loaded.laneNames[id] : undefined;
    return id && lane ? { id, icon: lane.icon, name: lane.name } : undefined;
  };
  switch (conversion.op) {
    case 'move_pool':
      return { poolLane: poolLane(conversion.poolLaneId) };
    case 'set_lane':
      return { declaredLaneId: conversion.myLaneId, poolLane: poolLane(conversion.placeOn) };
    default:
      return {};
  }
}

/** The same With, picks in any order (0035). */
function sameTogether(
  a: { everyone: boolean; picked: string[] } | undefined,
  b: { everyone: boolean; picked: string[] } | undefined,
): boolean {
  const norm = (t?: { everyone: boolean; picked: string[] }) =>
    t ? `${t.everyone}:${[...t.picked].sort().join()}` : 'false:';
  return norm(a) === norm(b);
}

/** The same annotation, compared on what it says. */
function sameAnnotation(a: Annotation | null, b: Annotation | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function EditForm({
  initial,
  context,
  pool,
  onCancel,
  onSave,
}: {
  initial: Loaded;
  context: SheetContext;
  pool: PoolScope | null;
  onCancel: () => void;
  onSave: (edit: Edit) => void;
}) {
  const { pools, today } = context;
  const lanes = useEditLanes(initial, context, pool, onCancel);
  const [title, setTitle] = useState(initial.title);
  const [icon, setIcon] = useState(initial.icon ?? '');
  // Its description (0037): a field once asked for, or once it has one.
  const [description, setDescription] = useState(initial.description ?? '');
  const [describing, setDescribing] = useState(Boolean(initial.description));
  const describedChange = description.trim() !== (initial.description ?? '');
  // The composer's own date control (review), prefilled with the splash's
  // days: its ripples take them (H24).
  const [annotation, setAnnotation] = useState<Annotation | null>(initial.annotation);
  const mine = initial.kind === 'mine';
  const joint = initial.kind === 'joint';
  const poolName = pools.find((p) => p.id === initial.poolId)?.name ?? 'its pool';
  const laneId = mine && lanes.laneId !== null ? lanes.laneId : initial.declaredLaneId;
  const shared = lanes.shared;

  const changed =
    title.trim() !== initial.title ||
    (icon || null) !== initial.icon ||
    describedChange ||
    (!joint && !sameAnnotation(annotation, initial.annotation)) ||
    lanes.changed;
  const rangeOk = !annotation || annotationVerdict(annotation) === 'ok';

  /** The splash's days as edited; unchanged, or removed, they stay as they were. */
  function dates(): Pick<Edit, 'declaredStart' | 'declaredEnd'> {
    const a = annotation;
    if (joint || !a || sameAnnotation(a, initial.annotation)) {
      return { declaredStart: initial.declaredStart, declaredEnd: initial.declaredEnd };
    }
    return {
      declaredStart: a.date,
      declaredEnd: a.endDate && a.endDate !== a.date ? a.endDate : null,
    };
  }

  if (initial.kind === 'theirs') {
    // Someone's record I wrote on (H45): only where it shows on my Home.
    return (
      <div data-edit-form="theirs" className="flex flex-col gap-5">
        <p className="text-main-900 text-3xl/snug font-semibold">
          {initial.icon ? `${initial.icon} ` : ''}
          {initial.title || 'Untitled'}
        </p>
        {lanes.node}
        <button
          type="button"
          onClick={onCancel}
          className="border-pool-200 text-ink rounded-full border py-2.5 text-base font-medium"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div data-edit-form={initial.kind} className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <EmojiInput value={icon} onChange={setIcon} label="Icon" placeholder="🙂" />
        <textarea
          value={title}
          onChange={(event) => setTitle(event.target.value.replace(/\n/g, ''))}
          rows={1}
          aria-label="Title"
          data-edit-title
          placeholder="Untitled"
          className="text-main-900 placeholder:text-main-900 min-w-0 flex-1 resize-none text-3xl/snug font-semibold outline-none placeholder:opacity-20"
        />
      </div>

      {/* The description (0037): optional, so asked for first. */}
      {describing ? (
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          maxLength={2000}
          aria-label="Description"
          data-edit-description
          placeholder="Describe this splash"
          className="text-ink placeholder:text-ink bg-pool-100 w-full resize-none rounded-xl px-3 py-2.5 text-sm/relaxed outline-none placeholder:opacity-30"
        />
      ) : (
        <button
          type="button"
          data-edit-description-add
          onClick={() => setDescribing(true)}
          className="text-pool-500 self-start text-sm"
        >
          + Add description
        </button>
      )}

      {joint ? (
        <p className="text-pool-500 text-xs">
          A joint splash belongs to {poolName}: its title and icon are everyone&apos;s to edit.
        </p>
      ) : (
        <div data-edit-date>
          <AnnotationControl
            annotation={annotation}
            today={today}
            onChange={setAnnotation}
            // A splash's own days have no clock (H24).
            clock={false}
            label="+ Add Date"
          />
        </div>
      )}

      {lanes.node}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="border-pool-200 text-ink flex-1 rounded-full border py-2.5 text-base font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          data-edit-save
          disabled={!changed || !rangeOk}
          onClick={save}
          className="bg-main-900 flex-1 rounded-full py-2.5 text-base font-semibold text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );

  function save(): void {
    if (initial.kind === 'theirs') return;
    onSave({
      kind: initial.kind,
      title: title.trim(),
      ...(describedChange ? { description: description.trim() } : {}),
      icon: icon || null,
      ...dates(),
      declaredLaneId: mine ? laneId : null,
      // Only the pools that changed: on, moved to another pool lane, or off.
      share: mine
        ? [
            ...shared
              .filter(
                (pick) =>
                  !initial.sharedIn.some(
                    (was) =>
                      was.poolId === pick.poolId &&
                      was.poolLaneId === pick.poolLaneId &&
                      sameTogether(was.together, pick.together),
                  ),
              )
              .map((pick) => ({
                poolId: pick.poolId,
                on: true,
                poolLaneId: pick.poolLaneId,
                ...(pick.together ? { together: pick.together } : {}),
              })),
            ...initial.sharedIn
              .filter((was) => !shared.some((pick) => pick.poolId === was.poolId))
              .map((was) => ({ poolId: was.poolId, on: false, poolLaneId: null })),
          ]
        : [],
      invite: lanes.invite,
      ownTogether: lanes.ownTogether ?? null,
      jointTogether: lanes.jointTogether ?? null,
      inviteEveryone: lanes.inviteEveryone,
      poolId: initial.poolId,
      poolLaneId: null,
      conversion: lanes.conversion,
    });
  }
}
