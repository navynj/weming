'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { AnnotationControl } from '@/features/input-sheet/annotation-control';
import { annotationVerdict, type Annotation } from '@/features/input-sheet/draft';
import { LaneChips } from '@/features/input-sheet/lane-chips';
import { EmojiInput } from '@/features/lanes/emoji-input';
import {
  AddImageAffordance,
  discardingOnRefusal,
  MediaPreviews,
  useMediaAttach,
} from '@/features/input-sheet/media-field';
import { placeCard, type Card, ownPoolColumn } from '@/features/home/grid';
import { createJointSplash, dropOwnPoolSplash, placeNewSplash } from '@/features/pool/actions';
import { preselectLane, withPick, withTogether, type AudiencePick } from '@/features/pool/audience';
import { AudienceChip, type AudiencePool } from '@/features/pool/audience-sheet';
import { lastPicked, rememberPick } from '@/features/pool/last-pick';
import type { PoolScope } from '@/features/pool/compose-scope';
import { poolSplashHref } from '@/features/pool/pool-cards';
import { PoolLanePicker, type PoolPick } from '@/features/pool/pool-lane-picker';
import type { Together } from '@/features/pool/pool-pick';
import { dropSplash, setSplashDescription } from '@/features/splash/actions';
import { defaultBlockDay, isRange } from '@/features/splash/block-day';
import { DayChip } from '@/features/splash/day-chip';
import { summarizeSplash, type SplashSummary } from '@/features/splash/summary';
import type { MyCategory } from '@/lib/queries/profile';
import type { IsoDate } from '@/lib/time';
import { usePeople } from '@/features/people/people-provider';
import type { PendingDrop } from '@/features/input-sheet/sheet-provider';

import { ComposeTop } from './compose-top';
import { SheetFooter } from './sheet-frame';
import { composeDrop } from './split-title';

export type SheetContext = {
  categories: MyCategory[];
  timeZone: string;
  today: IsoDate;
  /** The pools I am in now, with their lanes, for the Audience sheet. */
  pools: AudiencePool[];
  /** My initials, for a card dropped into a pool. */
  initials: string;
};

/** A drop as the composer hands it over: the post as the screen should show it, and the action that makes it true. */
export type DropHandoff = {
  splash: SplashSummary;
  month: string;
  /** The first block's words, for the recent column to preview at once. */
  note: string | null;
  /** Dropped from a pool (H23): the card that pool seats at once; the page stays there. */
  pool?: { poolId: string; card: Card };
  /** Dropped from a pool: where Home seats it before the server has it (0033). */
  home?: PendingDrop['home'];
  commit: () => Promise<{ ok: true } | { ok: false; message: string }>;
};

/** An IME is mid-composition: Chrome flags it, Safari reports keyCode 229. */
function isComposing(event: React.KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

/**
 * The composer (SPEC 6, H21, review): a large bold blue title field over a
 * smaller, lighter body field — the first line is still the title and Enter
 * still moves on to the body — the lane chip row (the post's lane), the
 * post's date chip preset to today, `+ Add Image`, and one full-width Drop.
 * The lane and the date are the post's, and every block takes them (H24). The
 * same form inside the phone's bottom sheet and the wide screen's standing
 * panel.
 *
 * Drop hands over at once (CLAUDE.md, the principle): the post as the
 * ground should show it, its month, and the action that makes it real. The
 * fields clear the moment it is handed over.
 */
export function SplashComposer({
  context,
  onDrop,
  autoFocus = true,
  pool = null,
}: {
  context: SheetContext;
  onDrop: (drop: DropHandoff) => void;
  autoFocus?: boolean;
  /** Composing from a pool (H23): its lanes are the picker, and it is the default audience. */
  pool?: PoolScope | null;
}) {
  const { categories, timeZone, today, pools, initials } = context;
  const { me } = usePeople();
  const fresh = (): Annotation => ({ date: today, time: null, endDate: null, endTime: null });
  const [titleText, setTitleText] = useState('');
  // The post's own icon (0008); empty lets the lane's emoji stand for it.
  const [icon, setIcon] = useState('');
  const [bodyText, setBodyText] = useState('');
  // The splash's description (0037), asked for from the top line's `…`.
  const [describing, setDescribing] = useState(false);
  const [description, setDescription] = useState('');
  const [laneId, setLaneId] = useState<string | null>(null);
  // From a pool: a pool lane, and Together (0033).
  const [pick, setPick] = useState<PoolPick>(null);
  // Everyone starts on exactly as the pool's switch says, nothing hidden
  // over it: a pool of one included (H61).
  const noOne = (): Together => ({
    everyone: Boolean(pool?.inviteAllByDefault),
    picked: [],
  });
  const [together, setTogether] = useState<Together>(noOne);
  // Edited by hand, the audience stays as set; untouched, it follows the lane.
  const [audienceEdited, setAudienceEdited] = useState<AudiencePick[] | null>(null);
  const joint = pick?.kind === 'joint';
  // My pool record (0033): mine, on the pool lane, with no lane of mine.
  const own = pick?.kind === 'own';
  // From a pool there is no audience to choose: what is written there is in
  // that pool, and only there. From Home, Only me until set (H45).
  const audience: AudiencePick[] = pool ? [] : (audienceEdited ?? []);
  // A pool or joint record shows in the pool's column on my Home until I
  // file it (H45).
  const poolLane = pool && pick ? pool.lanes.find((l) => l.id === pick.poolLaneId) : undefined;
  // Filled with Everyone on, or once anyone is picked (0033).
  const invitesOthers = together.everyone || together.picked.length > 0;
  // Today is in the field from the start (review): the post's date, days
  // only (H24). Removed with its ×, the post rests on today all the same.
  const [annotation, setAnnotation] = useState<Annotation | null>(fresh);
  // The first block's own day, when the post's date is a range (0031).
  const [chosenDay, setChosenDay] = useState<IsoDate | null>(null);
  const draftRange =
    annotation?.endDate && annotation.endDate > annotation.date
      ? { start: annotation.date, end: annotation.endDate }
      : null;
  const firstDay = isRange(draftRange)
    ? chosenDay && chosenDay >= draftRange.start && chosenDay <= draftRange.end
      ? chosenDay
      : defaultBlockDay(draftRange, today)
    : null;
  const [mediaPaths, setMediaPaths] = useState<string[]>([]);
  const media = useMediaAttach(mediaPaths, setMediaPaths);
  const field = useRef<HTMLTextAreaElement>(null);
  const bodyField = useRef<HTMLTextAreaElement>(null);

  // The fields grow with their words; the sheet's cap does the clipping.
  useLayoutEffect(() => {
    for (const el of [field.current, bodyField.current]) {
      if (!el) continue;
      el.style.height = 'auto';
      if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
    }
  }, [titleText, bodyText]);

  const { title, body } = composeDrop(titleText, bodyText);
  const hasContent =
    title.length > 0 || body.length > 0 || mediaPaths.length > 0 || laneId !== null;
  // From a pool a pool lane must be chosen, or the record would not land there.
  const poolReady =
    !pool ||
    (joint
      ? title.length > 0 || body.length > 0
      : own
        ? title.length > 0 || body.length > 0 || mediaPaths.length > 0
        : false);
  const annotationOk = !annotation || annotationVerdict(annotation) === 'ok';

  function drop(): void {
    const a = annotation;
    const id = crypto.randomUUID();
    const now = new Date();
    const hasBlock = body.length > 0 || mediaPaths.length > 0;
    // The post's range (H24): the chip's days, else today.
    const declaredStart = a?.date ?? today;
    const declaredEnd = a?.endDate && a.endDate !== a.date ? a.endDate : null;
    // The first block's day, inside the range only (0031).
    const blockDay = hasBlock && firstDay ? firstDay : null;
    const input = {
      id,
      title,
      body,
      media: mediaPaths,
      mediaMeta: media.meta,
      declaredStart,
      declaredEnd,
      declaredLaneId: laneId,
      icon: icon || null,
      today,
      sessionId: null,
      blockDay,
    };

    // The post as the ground should show it, summarised the way the page
    // summarises a real one.
    const splash = summarizeSplash(
      {
        id,
        owner_id: '',
        title,
        declared_start: declaredStart,
        declared_end: declaredEnd,
        declared_lane_id: laneId,
        icon: icon || null,
        session_id: null,
        pinned_at: null,
        pool_id: null,
        pool_lane_id: null,
        own_pool_id: own && pool ? pool.poolId : null,
        created_by: null,
        joint_invite_all: false,
        is_welcome: false,
        description: describing && description.trim() ? description.trim() : null,
        type: 'free',
        prompt: null,
        ends_at: null,
        created_at: now.toISOString(),
        // Mine, written now: today in my zone, as the trigger will store it.
        written_on: today,
      },
      hasBlock
        ? [
            {
              id: `${id}-first`,
              note: body.length > 0 ? body : null,
              occurred_on: blockDay,
              occurred_time: null,
              created_at: now.toISOString(),
            },
          ]
        : [],
      timeZone,
      now,
    );

    // Handed over with the drop: a refusal takes the post back and its photos with it.
    const uploaded = media.keep(mediaPaths);
    const shared = audience;
    // The card this pool seats before the server has it (H23).
    const poolCard: Card | null =
      pool && poolLane && (joint || own)
        ? {
            ...placeCard(splash, body, timeZone),
            column: poolLane.id,
            lane: { icon: poolLane.icon, name: poolLane.name },
            href: poolSplashHref(pool.poolId, id),
            ...(joint
              ? {
                  joint: true,
                  together: invitesOthers,
                  branches: body
                    ? [
                        {
                          id: `${id}-first`,
                          column: poolLane.id,
                          initials,
                          authorId: me ?? undefined,
                        },
                      ]
                    : [],
                }
              : { author: initials, authorId: me ?? undefined }),
          }
        : null;

    // Home seats it where the server will (review, H45): in the pool's
    // column with the pool lane's emoji.
    const poolColumn = pool
      ? {
          id: ownPoolColumn(pool.poolId),
          name: pool.poolName,
          icon: null,
          monogram: pool.poolName,
          href: null,
        }
      : null;
    const fallback = poolLane ? { icon: poolLane.icon, name: pool!.poolName } : null;
    const home =
      pool && poolColumn && (joint || own)
        ? {
            card: {
              ...(joint
                ? {
                    column: poolColumn.id,
                    joint: true,
                    together: invitesOthers,
                    pools: [pool.poolName],
                    href: poolSplashHref(pool.poolId, id),
                    menu: { pin: false, delete: false },
                    editable: true,
                  }
                : { column: poolColumn.id }),
              ...(fallback ? { lane: fallback } : {}),
            },
            column: poolColumn,
          }
        : undefined;

    // Written after the splash itself, by the same action the page uses: any
    // drop path, mine or joint (RLS holds who may).
    const described = describing ? description.trim() : '';
    const withDescription =
      (made: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
      async (): Promise<{ ok: true } | { ok: false; message: string }> => {
        const done = await made();
        if (!done.ok || !described) return done;
        const saved = await setSplashDescription(id, described);
        return saved.ok
          ? saved
          : { ok: false, message: `Dropped, but the description was not saved: ${saved.message}` };
      };

    onDrop({
      splash,
      month: declaredStart.slice(0, 7),
      note: body.length > 0 ? body : null,
      ...(pool && poolCard ? { pool: { poolId: pool.poolId, card: poolCard } } : {}),
      ...(home ? { home } : {}),
      commit: discardingOnRefusal(
        withDescription(
          own
            ? () =>
                dropOwnPoolSplash({
                  id,
                  poolId: pool!.poolId,
                  poolLaneId: pick.poolLaneId,
                  title,
                  icon: icon || null,
                  body,
                  media: mediaPaths,
                  mediaMeta: media.meta,
                  declaredStart,
                  declaredEnd,
                  blockDay,
                })
            : joint
              ? () =>
                  createJointSplash({
                    id,
                    poolId: pool!.poolId,
                    poolLaneId: pick.poolLaneId,
                    title,
                    icon: icon || null,
                    body,
                    media: mediaPaths,
                    mediaMeta: media.meta,
                    declaredStart,
                    declaredEnd,
                    blockDay,
                    invitees: together.everyone ? [] : together.picked,
                    everyone: together.everyone,
                  })
              : async () => {
                  const made = await dropSplash(input);
                  if (!made.ok || shared.length === 0) return made;
                  const placed = await placeNewSplash(id, shared);
                  return placed.ok
                    ? placed
                    : { ok: false, message: `Dropped, but not shared: ${placed.message}` };
                },
        ),
        uploaded,
      ),
    });

    setTitleText('');
    setIcon('');
    setBodyText('');
    setDescribing(false);
    setDescription('');
    setLaneId(null);
    setPick(null);
    setTogether(noOne());
    setAudienceEdited(null);
    setAnnotation(fresh());
    setChosenDay(null);
    setMediaPaths([]);
    field.current?.focus();
  }

  return (
    <div data-splash-composer className="flex flex-col gap-5">
      {/* The title, large and bold; Enter moves on to the body, so the
          first line is still the title and the rest still follows it.
          Not while an IME is composing (Korean, say): that Enter commits
          the character, and moving focus on it would carry the character
          into the body. */}
      <div className="flex items-start gap-3">
        {/* The post's own icon: one glyph from the phone's emoji keyboard,
          shown large; left empty, the lane's emoji stands for the post. */}
        <EmojiInput
          value={icon}
          onChange={setIcon}
          label="Icon"
          placeholder={categories.find((c) => c.id === laneId)?.icon ?? '🙂'}
        />
        <textarea
          ref={field}
          value={titleText}
          onChange={(event) => setTitleText(event.target.value.replace(/\n/g, ''))}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (isComposing(event)) return;
            bodyField.current?.focus();
          }}
          placeholder="Drop your splash"
          rows={1}
          autoFocus={autoFocus}
          aria-label="Title"
          data-sheet-title
          className="text-main-900 placeholder:text-main-900 min-w-0 flex-1 resize-none text-3xl/snug font-semibold outline-none placeholder:opacity-20"
        />
        {/* `…` beside the title, not on a line of its own above it, so the
            sheet does not open on an empty top (Yoonji, in the session). */}
        <ComposeTop describing={describing} onDescribing={setDescribing} />
      </div>
      {/* The description, only once asked for (review): under the title,
          small, its placeholder faint, and a divider under it as on the
          post's page (Yoonji, in the session), so it is not taken for the
          body. */}
      {describing ? (
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          autoFocus
          rows={1}
          maxLength={2000}
          placeholder="Describe this splash"
          aria-label="Description"
          data-compose-description-field
          className="text-ink placeholder:text-ink border-pool-100 -mt-2 w-full resize-none border-b pb-4 text-sm/relaxed outline-none placeholder:opacity-30"
        />
      ) : null}
      {/* Backspace at the very start of the body walks the cursor back up
          to the end of the title, the way a notes app does. */}
      <textarea
        ref={bodyField}
        value={bodyText}
        onChange={(event) => setBodyText(event.target.value)}
        onKeyDown={(event) => {
          const el = event.currentTarget;
          if (event.key !== 'Backspace' || el.selectionStart !== 0 || el.selectionEnd !== 0) return;
          if (isComposing(event)) return;
          event.preventDefault();
          const title = field.current;
          if (!title) return;
          title.focus();
          title.setSelectionRange(title.value.length, title.value.length);
        }}
        placeholder="Enter the content"
        rows={2}
        aria-label="Content"
        data-sheet-body
        className="text-ink placeholder:text-ink min-h-12 w-full resize-none text-base/relaxed font-light outline-none placeholder:opacity-20"
      />

      {/* The date and a photo come first, above the lane (review). */}
      <div className="flex flex-wrap items-center gap-2">
        <AnnotationControl
          annotation={annotation}
          today={today}
          onChange={setAnnotation}
          clock={false}
          label="+ Add Date"
        />
        {/* The first block's day inside the post's range (0031). */}
        {firstDay && isRange(draftRange) ? (
          <DayChip range={draftRange} value={firstDay} onChange={setChosenDay} />
        ) : null}
        <AddImageAffordance
          attach={media.attach}
          busy={media.busy}
          input={media.input}
          progress={media.progress}
        />
      </div>
      <MediaPreviews
        paths={mediaPaths}
        previews={media.previews}
        failed={media.failed}
        onChange={media.change}
      />

      {/* The post's lane: every block of it takes this one (H24).
          From a pool: its lanes and Together, and no audience (H23, 0033). */}
      {pool ? (
        <PoolLanePicker
          scope={pool}
          pick={pick}
          onPick={setPick}
          together={together}
          onTogether={setTogether}
        />
      ) : (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <LaneChips
              categories={categories}
              selectedId={laneId}
              onSelect={setLaneId}
              surface="white"
            />
          </div>
          {/* Where it is shared (H23): only from Home. */}
          {pools.length > 0 ? (
            <AudienceChip
              shared={audience}
              pools={pools}
              preselect={(poolId) =>
                preselectLane(
                  lastPicked(laneId, poolId),
                  pools.find((p) => p.id === poolId)?.lanes.map((l) => l.id) ?? [],
                )
              }
              onChange={(poolId, poolLaneId) => {
                if (poolLaneId) rememberPick(laneId, poolId, poolLaneId);
                setAudienceEdited(withPick(audienceEdited ?? [], poolId, poolLaneId));
              }}
              onTogether={(poolId, together) =>
                setAudienceEdited(withTogether(audienceEdited ?? [], poolId, together))
              }
            />
          ) : null}
        </div>
      )}

      {/* Blue means action: the one filled thing here commits (H20f).
          Pinned to the sheet's bottom, in reach above the keyboard. */}
      <SheetFooter>
        <button
          type="button"
          disabled={!hasContent || !annotationOk || !poolReady}
          onClick={drop}
          className="bg-main-900 w-full rounded-full py-2.5 text-xl font-medium text-white disabled:opacity-50"
        >
          Drop
        </button>
      </SheetFooter>
    </div>
  );
}
