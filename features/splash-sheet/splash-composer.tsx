'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { AnnotationControl } from '@/features/input-sheet/annotation-control';
import { annotationVerdict, type Annotation } from '@/features/input-sheet/draft';
import { LaneChips } from '@/features/input-sheet/lane-chips';
import { EmojiInput } from '@/features/lanes/emoji-input';
import {
  AddImageAffordance,
  MediaPreviews,
  useMediaAttach,
} from '@/features/input-sheet/media-field';
import { placeCard, type Card, ownPoolColumn } from '@/features/home/grid';
import { createJointSplash, dropOwnPoolSplash, placeNewSplash } from '@/features/pool/actions';
import { defaultAudience, linkedPools, type AudienceLink } from '@/features/pool/audience';
import { bringsIn } from '@/features/pool/direction';
import { AudienceChip } from '@/features/pool/audience-sheet';
import type { PoolScope } from '@/features/pool/compose-scope';
import { poolSplashHref } from '@/features/pool/pool-cards';
import { PoolLanePicker, type PoolPick } from '@/features/pool/pool-lane-picker';
import { dropSplash } from '@/features/splash/actions';
import { summarizeSplash, type SplashSummary } from '@/features/splash/summary';
import type { MyCategory } from '@/lib/queries/profile';
import type { IsoDate } from '@/lib/time';
import { usePeople } from '@/features/people/people-provider';

import { composeDrop } from './split-title';

export type SheetContext = {
  categories: MyCategory[];
  timeZone: string;
  today: IsoDate;
  /** My lane links across my pools: the Audience chip's default (H23). */
  links: AudienceLink[];
  /** The pools I am in now, for the Audience sheet. */
  pools: { id: string; name: string }[];
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
  const { categories, timeZone, today, links, pools, initials } = context;
  const { me } = usePeople();
  const fresh = (): Annotation => ({ date: today, time: null, endDate: null, endTime: null });
  const [titleText, setTitleText] = useState('');
  // The post's own icon (0008); empty lets the lane's emoji stand for it.
  const [icon, setIcon] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [laneId, setLaneId] = useState<string | null>(null);
  // From a pool: a pool lane (a joint splash), or one of my linked lanes (H23).
  const [pick, setPick] = useState<PoolPick>(null);
  // Edited by hand, the audience stays as set; untouched, it follows the lane.
  const [audienceEdited, setAudienceEdited] = useState<string[] | null>(null);
  const joint = pick?.kind === 'joint';
  // "Just mine" (0014): my splash on the pool lane, with no lane of mine.
  const own = pick?.kind === 'own';
  // Only pools where the lane is linked can take the post (C5), edited or not.
  // Every pool the lane is linked in gets a switch; only out and both links
  // are on by default (0017).
  const linkedHere = linkedPools(laneId, links);
  const sharedByDefault = defaultAudience(laneId, links);
  // From a pool there is no audience to choose: what is written there is in
  // that pool, and only there.
  const audience = pool
    ? joint || own
      ? []
      : [pool.poolId]
    : (audienceEdited ?? sharedByDefault).filter((poolId) => linkedHere.includes(poolId));
  // A joint splash shows on my Home in the lane I linked to its pool lane
  // when the link brings in (both, in), else in the pool's column — derived
  // from the link, never stored on a ripple (H24).
  const jointPoolLane = joint ? pool?.lanes.find((l) => l.id === pick.poolLaneId) : undefined;
  const jointLink =
    jointPoolLane && bringsIn(jointPoolLane.direction) ? jointPoolLane.myCategoryId : null;
  // Today is in the field from the start (review): the post's date, days
  // only (H24). Removed with its ×, the post rests on today all the same.
  const [annotation, setAnnotation] = useState<Annotation | null>(fresh);
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
  // From a pool a lane must be chosen, or the post would not land there.
  const poolReady =
    !pool ||
    (joint
      ? title.length > 0 || body.length > 0
      : own
        ? title.length > 0 || body.length > 0 || mediaPaths.length > 0
        : laneId !== null);
  const annotationOk = !annotation || annotationVerdict(annotation) === 'ok';

  function drop(): void {
    const a = annotation;
    const id = crypto.randomUUID();
    const now = new Date();
    const hasBlock = body.length > 0 || mediaPaths.length > 0;
    // The post's range (H24): the chip's days, else today.
    const declaredStart = a?.date ?? today;
    const declaredEnd = a?.endDate && a.endDate !== a.date ? a.endDate : null;
    const input = {
      id,
      title,
      body,
      media: mediaPaths,
      declaredStart,
      declaredEnd,
      declaredLaneId: laneId,
      icon: icon || null,
      today,
      sessionId: null,
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
              category_id: null,
              note: body.length > 0 ? body : null,
              occurred_on: null,
              occurred_time: null,
              created_at: now.toISOString(),
            },
          ]
        : [],
      timeZone,
      now,
    );

    const shared = audience;
    const poolLane = pool
      ? pool.lanes.find((l) =>
          joint || own
            ? l.id === pick.poolLaneId
            : l.myCategoryId !== null && l.myCategoryId === laneId,
        )
      : undefined;
    // The card this pool seats before the server has it (H23).
    const poolCard: Card | null =
      pool && poolLane && (joint || own || shared.includes(pool.poolId))
        ? {
            ...placeCard(splash, body, timeZone),
            column: poolLane.id,
            lane: { icon: poolLane.icon, name: poolLane.name },
            href: poolSplashHref(pool.poolId, id),
            ...(joint
              ? {
                  joint: true,
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

    // Home seats it where the server will (review): a joint splash with no
    // lane of mine, and Just mine, in the pool's column with the pool lane's
    // emoji; a joint ripple in my linked lane, in that lane.
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
                    column: jointLink ?? poolColumn.id,
                    joint: true,
                    pools: [pool.poolName],
                    href: poolSplashHref(pool.poolId, id),
                    menu: { pin: false, delete: false },
                    editable: true,
                  }
                : {}),
              ...(fallback && !(joint && jointLink) ? { lane: fallback } : {}),
            },
            ...(joint && jointLink ? {} : { column: poolColumn }),
          }
        : undefined;

    onDrop({
      splash,
      month: declaredStart.slice(0, 7),
      note: body.length > 0 ? body : null,
      ...(pool && poolCard ? { pool: { poolId: pool.poolId, card: poolCard } } : {}),
      ...(home ? { home } : {}),
      commit: own
        ? () =>
            dropOwnPoolSplash({
              id,
              poolId: pool!.poolId,
              poolLaneId: pick.poolLaneId,
              title,
              icon: icon || null,
              body,
              media: mediaPaths,
              declaredStart,
              declaredEnd,
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
                declaredStart,
                declaredEnd,
              })
          : async () => {
              const made = await dropSplash(input);
              if (!made.ok || shared.length === 0) return made;
              const placed = await placeNewSplash(id, shared);
              return placed.ok
                ? placed
                : { ok: false, message: `Dropped, but not shared: ${placed.message}` };
            },
    });

    setTitleText('');
    setIcon('');
    setBodyText('');
    setLaneId(null);
    setPick(null);
    setAudienceEdited(null);
    setAnnotation(fresh());
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
      </div>
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
        <AddImageAffordance attach={media.attach} busy={media.busy} input={media.input} />
      </div>
      <MediaPreviews
        paths={mediaPaths}
        previews={media.previews}
        failed={media.failed}
        onChange={setMediaPaths}
      />

      {/* The post's lane: every block of it takes this one (H24).
          From a pool: Pool lanes | My lanes, and no audience (H23). */}
      {pool ? (
        <PoolLanePicker
          scope={pool}
          categories={categories}
          pick={pick}
          onPick={(next) => {
            setPick(next);
            setLaneId(next?.kind === 'lane' ? next.myCategoryId : null);
          }}
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
              linked={pools
                .filter((p) => linkedHere.includes(p.id))
                .map((p) => ({ poolId: p.id, name: p.name }))}
              unlinked={pools
                .filter((p) => !linkedHere.includes(p.id))
                .map((p) => ({ poolId: p.id, name: p.name }))}
              onToggle={(poolId, on) => {
                const base = audienceEdited ?? sharedByDefault;
                setAudienceEdited(
                  on ? [...new Set([...base, poolId])] : base.filter((id) => id !== poolId),
                );
              }}
            />
          ) : null}
        </div>
      )}

      {/* Blue means action: the one filled thing here commits (H20f). */}
      <button
        type="button"
        disabled={!hasContent || !annotationOk || !poolReady}
        onClick={drop}
        className="bg-main-900 w-full rounded-full py-2.5 text-xl font-medium text-white disabled:opacity-50"
      >
        Drop
      </button>
    </div>
  );
}
