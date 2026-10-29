'use client';

// DORMANT (H20b, H21): the ripple sheet. No surface reaches this since the
// refounding — new posts come from the post sheet and every later word is
// written on the post's page. Kept, compiling, because the dormant focus
// screen hosts it for P3's Swim. Do not wire it back in; do not delete it.

import { useState, useTransition } from 'react';

import { COLUMN_MAX_WIDTH } from '@/components/ui/column';
import { updateRipple } from '@/features/ripple-sheet/actions';
import type { SplashSummary } from '@/features/splash/summary';
import type { MyCategory } from '@/lib/queries/profile';
import type { RippleWithSplash } from '@/lib/queries/ripples';
import { wallClockToInstant } from '@/lib/ripple-kind';
import type { IsoDate } from '@/lib/time';

import { AnnotationControl } from './annotation-control';
import { commitRipple, type CommitResult } from './commit';
import {
  annotationVerdict,
  draftFrom,
  emptyDraft,
  laneRule,
  resolveCategory,
  spanIsEmpty,
  spanKeys,
  type Draft,
  type Prefill,
} from './draft';
import { LaneChips } from './lane-chips';
import { AddImageAffordance, MediaPreviews, useMediaAttach } from './media-field';
import { SplashPicker } from './splash-picker';

export type SheetContext = {
  categories: MyCategory[];
  /** Recent first, for the picker and for the board's chip. */
  splashes: SplashSummary[];
  timeZone: string;
  today: IsoDate;
};

/**
 * The ripple sheet (SPEC 6, `_docs/mockups/sheet-ripple.png`): lane chips,
 * one autofocused note field with the lane's emoji as its badge, two quiet
 * affordances, `+ Add to Splash`, and a single full-width Drop.
 *
 * No mode toggle — the entry path decided this was a ripple. No Timer, no
 * audience chip (H20b, H20g). A note-only, a photo-only and a chip-only
 * commit are all valid; nothing at all is the one thing that is not.
 */
export function InputSheet({
  context,
  prefill,
  editing,
  onClose,
  onCommitted,
  onNewSplash,
}: {
  context: SheetContext;
  prefill: Prefill;
  /** Present in edit mode: the same sheet, correcting instead of composing. */
  editing?: { ripple: RippleWithSplash } | null;
  onClose: () => void;
  onCommitted: (rippleId: string) => void;
  /** The picker's *New splash*: hands over to the splash editor, note and all. */
  onNewSplash?: (note: string) => void;
}) {
  const { categories, timeZone, today } = context;
  // A board created a moment ago rides in on the prefill until the page's
  // data catches up with it.
  const splashes = prefill.splash
    ? [prefill.splash, ...context.splashes.filter((s) => s.id !== prefill.splash!.id)]
    : context.splashes;

  const [draft, setDraft] = useState<Draft>(() =>
    editing ? draftFrom(editing.ripple, timeZone) : emptyDraft(prefill),
  );
  const [result, setResult] = useState<CommitResult | null>(null);
  const [pending, startTransition] = useTransition();
  const media = useMediaAttach(draft.media, (next) => setDraft((d) => ({ ...d, media: next })));

  const splash = splashes.find((s) => s.id === draft.splashId) ?? null;
  // A declaration is a default (H21f): the post's declared lane is where the
  // selection starts, and the resolved lane is what the badge shows.
  const rule = laneRule(splash);
  const categoryId = resolveCategory(draft.categoryId, rule, categories);
  const selected = categories.find((c) => c.id === categoryId) ?? null;

  const hasContent = draft.note.trim().length > 0 || draft.media.length > 0 || draft.categoryId;
  const annotationOk = !draft.annotation || annotationVerdict(draft.annotation) === 'ok';
  const isEdit = Boolean(editing);

  function commit(): void {
    setResult(null);

    const a = draft.annotation;
    const startInstant =
      a && a.time ? wallClockToInstant(a.date, a.time, timeZone).toISOString() : null;
    // A span's end: the end clock against a start clock, or by dates alone
    // the close of the end day. A same-day end without clocks is no span.
    const span = a && !spanIsEmpty(a) ? spanKeys(a) : null;
    const endInstant = span?.end
      ? wallClockToInstant(span.end.slice(0, 10), span.end.slice(11), timeZone).toISOString()
      : null;

    if (editing) {
      startTransition(async () => {
        const outcome = await updateRipple({
          id: editing.ripple.id,
          categoryId,
          note: draft.note,
          media: draft.media,
          mediaMeta: media.meta,
          occurredOn: a?.date ?? null,
          occurredTime: a?.time ?? null,
          startInstant,
          endInstant,
          splashId: draft.splashId,
        });
        if (outcome.ok) onCommitted(outcome.rippleId);
        else setResult(outcome);
      });
      return;
    }

    startTransition(async () => {
      const outcome = await commitRipple({
        categoryId: draft.categoryId,
        note: draft.note,
        media: draft.media,
        mediaMeta: media.meta,
        occurredOn: a?.date ?? null,
        occurredTime: a?.time ?? null,
        startInstant,
        endInstant,
        splashId: draft.splashId,
      });
      if (outcome.ok) onCommitted(outcome.rippleId);
      else setResult(outcome);
    });
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
        aria-label={isEdit ? 'Edit this ripple' : 'Drop a ripple'}
        className={`sheet-rise bg-pool-100 relative mx-auto flex max-h-[88vh] w-full ${COLUMN_MAX_WIDTH} flex-col overflow-hidden rounded-t-[32px]`}
      >
        {/* The post's declared lane is where the selection starts (H21f). */}
        <LaneChips
          categories={categories}
          selectedId={categoryId}
          onSelect={(id) => setDraft((d) => ({ ...d, categoryId: id }))}
        />

        <div
          className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-t-[32px] bg-white px-5 pt-6"
          style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-start gap-3">
            {/* The lane's emoji is the field's badge and follows the selection. */}
            <span
              aria-hidden
              data-lane-badge
              className="bg-pool-100 flex h-[59px] w-[59px] shrink-0 items-center justify-center rounded-full text-3xl"
            >
              {selected?.icon ?? ''}
            </span>
            <textarea
              value={draft.note}
              onChange={(event) => setDraft((d) => ({ ...d, note: event.target.value }))}
              placeholder="Drop your words here"
              rows={3}
              autoFocus
              aria-label="Note"
              className="text-ink placeholder:text-ink min-h-20 w-full resize-none pt-3 text-xl outline-none placeholder:opacity-20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AnnotationControl
              annotation={draft.annotation}
              today={today}
              onChange={(annotation) => setDraft((d) => ({ ...d, annotation }))}
            />
            <AddImageAffordance
              attach={media.attach}
              busy={media.busy}
              input={media.input}
              progress={media.progress}
            />
          </div>

          {result && !result.ok ? (
            <p role="alert" className="text-pool-500 text-sm">
              {result.reason === 'error' ? result.message : 'That could not be recorded.'}
            </p>
          ) : null}

          <div className="flex-1" />

          <MediaPreviews
            paths={draft.media}
            previews={media.previews}
            failed={media.failed}
            onChange={(next) => setDraft((d) => ({ ...d, media: next }))}
          />

          <SplashPicker
            splashes={splashes}
            selected={splash}
            onSelect={(id) => setDraft((d) => ({ ...d, splashId: id }))}
            onNew={() => onNewSplash?.(draft.note)}
          />

          {/* Blue means action: the one filled thing here commits (H20f). */}
          <button
            type="button"
            disabled={pending || !hasContent || !annotationOk || !categoryId}
            onClick={commit}
            className="bg-main-900 w-full rounded-full py-2.5 text-xl font-medium text-white disabled:opacity-50"
          >
            {isEdit ? 'Update' : 'Drop'}
          </button>
        </div>
      </section>
    </div>
  );
}
