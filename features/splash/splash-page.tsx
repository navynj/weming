'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { GhostRing } from '@/components/ui/ghost-ring';
import type { CommitResult } from '@/features/input-sheet/commit';
import { useInputSheet } from '@/features/input-sheet/sheet-provider';
import { deleteRipple, setRippleLock } from '@/features/ripple-sheet/actions';
import type { MyCategory } from '@/lib/queries/profile';
import type { RippleWithSplash } from '@/lib/queries/ripples';
import type { IsoDate } from '@/lib/time';
import { useOptimisticAction, type ActionOutcome } from '@/lib/use-optimistic-action';

import { deleteJointSplash } from '@/features/pool/actions';
import { usePeople } from '@/features/people/people-provider';
import { latestFromOthers, type RippleResponsesValue } from '@/features/responses/model';
import { RippleResponses } from '@/features/responses/ripple-responses';
import { isUnseen, rememberSeen, useSeenBefore } from '@/features/responses/seen';
import { useOpenedAt, useRippleResponses } from '@/features/responses/use-ripple-responses';
import { authorClock } from '@/features/pool/times';
import { usePoolEditScope } from '@/features/pool/edit-scope';

import { deleteSplash, setSplashPinned, updateSplashHeader, setSplashDescription } from './actions';
import { addBlock, editBlock } from './block-actions';
import { SplashDescription } from './splash-description';
import { orderBlocks } from './block-day';
import { BlockEditor, type BlockDraft, type EditorTarget } from './block-editor';
import { BlockView } from './block';
import { RippleThread } from './ripple-thread';
import { useCloseSplash } from './splash-modal';
import { SplashHeader, type HeaderEdit } from './splash-header';
import type { SplashSummary } from './summary';

/**
 * The page read inside a pool (review): the same page as Home's, with each
 * ripple's author, and edits by right — my own splash fully; a joint
 * splash's title and icon by any current member, ripples by their authors;
 * someone else's splash read only. Ripples I did not write are read only.
 */
export type PoolContext = {
  poolId: string;
  me: string;
  scope: 'mine' | 'joint' | 'theirs';
  /** Initials by author, for every ripple's avatar. */
  initialsOf: Record<string, string>;
  /** The pool lane's chip, in place of my lane tags. */
  laneChip: { icon: string | null; name: string } | null;
  /** A joint splash goes only while every ripple on it is mine (0011). */
  canDeleteJoint: boolean;
  /** Each author's zone (0013): a ripple's time shows in mine, theirs after it when they differ. */
  zoneOf: Record<string, string>;
};

/** A block action's result, read as a plain outcome: the dormant refusals have no surface here. */
function outcome(result: CommitResult): ActionOutcome {
  if (result.ok) return { ok: true };
  return {
    ok: false,
    message: result.reason === 'error' ? result.message : 'That could not be saved.',
  };
}

const NO_RESPONSES: RippleResponsesValue = { reactions: [], replies: [] };

/** What the page holds and edits: the post and its blocks, as one value. */
type PageState = { splash: SplashSummary; blocks: RippleWithSplash[]; lockedIds: string[] };

/**
 * A post's detail (SPEC 5, H21c), shown in the splash sheet over the screen it
 * was opened from (review): the header stack; the blocks oldest first, each
 * edited in place; an add slot at the bottom that starts a new block on the
 * page. No sheet here.
 *
 * Every change shows the moment it is made and the action runs behind it
 * (CLAUDE.md, the principle): a saved block reads saved, a deleted one is
 * gone, a pin is pinned, and the page re-reads inside the same transition.
 *
 * On a wide screen the page is two halves (review): the header stays on the
 * left, the blocks and the add slot read down the right.
 *
 * A block whose post I can no longer read (a joint splash of a pool I left)
 * renders here as an untitled post of one: read, and deleted, never written
 * on — it has no post of mine to write on (H24).
 */
export function SplashPage({
  splash,
  blocks,
  photos,
  lockedIds,
  categories,
  timeZone,
  today,
  initials = '',
  audience = null,
  poolTags = [],
  pool = null,
  writing = false,
  responses = NO_RESPONSES,
  respondable = false,
  threads = [],
  initialsOf = {},
  sidePool = null,
}: {
  splash: SplashSummary;
  /** Oldest first. */
  blocks: RippleWithSplash[];
  photos: Record<string, (string | null)[]>;
  lockedIds: string[];
  categories: MyCategory[];
  timeZone: string;
  today: IsoDate;
  /** The author's initials, for each ripple's avatar in the thread (round 3). */
  initials?: string;
  /** The Audience chip for the header (H23). */
  audience?: ReactNode;
  /** Where it is or was in a pool (0015): "<Pool> · <emoji> <pool lane>". */
  poolTags?: string[];
  /** Read inside a pool (review). */
  pool?: PoolContext | null;
  /** Opened to write: the next block's editor is up from the start (Board view's "Add your side"). */
  writing?: boolean;
  /** What readers left under its blocks (H25). */
  responses?: RippleResponsesValue;
  /** Someone besides me can see it, so its blocks take reactions and replies (H25). */
  respondable?: boolean;
  /**
   * My record on Home, shared to pools whose members wrote (0035): a tab per
   * pool, each my ripples and that pool's members'; off placements muted.
   */
  threads?: { poolId: string; label: string; count: number; off: boolean }[];
  /** Initials by author, for others' ripples read on Home (0035). */
  initialsOf?: Record<string, string>;
  /**
   * Someone's record I am invited on in this pool (0035): I may add my side,
   * written in this pool.
   */
  sidePool?: string | null;
}) {
  const scope = pool?.scope ?? 'mine';
  const orphan = splash.orphan;
  const router = useRouter();
  const { markDeleted, openEdit, pendingEdits } = useInputSheet();
  const editScope = usePoolEditScope();
  // Inside the splash sheet (review): a delete closes it over the screen beneath.
  const closeSheet = useCloseSplash();
  const { me } = usePeople();
  // Mine to edit: my own ripples only — on Home others' are read there too (0035).
  const editable = (block: RippleWithSplash): boolean =>
    pool ? block.author_id === pool.me : !me || block.author_id === me;
  const answered = useRippleResponses(responses);
  // Opened at a reply from the board: its block's replies open in full (H25).
  const openedAt = useOpenedAt();
  const [expanded, setExpanded] = useState<string[]>([]);
  const openedRipple = answered.value.replies.find((r) => `reply-${r.id}` === openedAt)?.ripple_id;
  const isExpanded = (id: string): boolean => expanded.includes(id) || id === openedRipple;
  // Seen as of this open, on this device; its dots stay until the next (H25).
  const seenBefore = useSeenBefore(splash.id);
  const fromOthers = latestFromOthers(answered.value, me ?? '', (id) =>
    blocks.some((b) => b.id === id && b.author_id === me),
  );
  useEffect(() => rememberSeen(splash.id), [splash.id]);
  useEffect(() => {
    if (!openedAt) return;
    // The badge opens at the first block anyone reacted or replied to (H25).
    const target =
      openedAt === 'responded'
        ? document.querySelector('[data-reaction], [data-reply]')?.closest('[data-block-entry]')
        : document.getElementById(openedAt);
    target?.scrollIntoView({ block: 'center' });
  }, [openedAt, openedRipple]);
  const [editor, setEditor] = useState<EditorTarget | null>(() =>
    writing && !splash.orphan ? { kind: 'add', splashId: splash.id } : null,
  );
  // Tabs per pool on my record (0035): the first opens.
  const [tab, setTab] = useState<string | null>(threads[0]?.poolId ?? null);
  // Which blocks show: in a pool, the owner's and that pool's members'; on
  // Home with tabs, the owner's and the tab's; else every one I can read.
  const shownPool = pool ? pool.poolId : threads.length > 0 ? tab : null;
  const showsBlock = (block: RippleWithSplash): boolean =>
    !block.thread_pool_id || shownPool === null || block.thread_pool_id === shownPool;
  const {
    value: page,
    run,
    message,
  } = useOptimisticAction<PageState>({
    splash,
    blocks,
    lockedIds,
  });

  /** A header change, shown at once: the post's lane and range are what its blocks take (H24). */
  function editHeader(edit: HeaderEdit): Promise<void> {
    const range = edit.declaredStart
      ? { start: edit.declaredStart, end: edit.declaredEnd ?? edit.declaredStart }
      : null;
    run(
      (current) => ({
        ...current,
        splash: {
          ...current.splash,
          title: edit.title,
          icon: edit.icon,
          declaredLaneId: edit.declaredLaneId,
          laneIds: edit.declaredLaneId ? [edit.declaredLaneId] : [],
          ...(range ? { declaredRange: range, range } : {}),
        },
      }),
      () => updateSplashHeader(page.splash.id, edit),
      'Saved',
    );
    return Promise.resolve();
  }

  /** The description, shown at once (0037); empty takes it off. */
  function describe(text: string): void {
    run(
      (current) => ({ ...current, splash: { ...current.splash, description: text || null } }),
      () => setSplashDescription(page.splash.id, text),
      text ? 'Description saved' : 'Description removed',
    );
  }

  function pin(pinned: boolean): Promise<void> {
    run(
      (current) => ({
        ...current,
        splash: { ...current.splash, pinnedAt: pinned ? new Date().toISOString() : null },
      }),
      () => setSplashPinned(page.splash.id, pinned),
    );
    return Promise.resolve();
  }

  /** The block as the screen should show it: its words, photos, and its day on a range (0031). */
  function shaped(base: RippleWithSplash, draft: BlockDraft): RippleWithSplash {
    return {
      ...base,
      note: draft.note.trim().length > 0 ? draft.note : null,
      media: draft.media,
      ...(draft.occurredOn ? { occurred_on: draft.occurredOn } : {}),
    };
  }

  function saveBlock(target: EditorTarget, draft: BlockDraft): void {
    setEditor(null);
    if (target.kind === 'edit') {
      const block = target.block;
      run(
        (current) => ({
          ...current,
          blocks: current.blocks.map((b) => (b.id === block.id ? shaped(b, draft) : b)),
        }),
        async () =>
          outcome(
            await editBlock({
              id: block.id,
              note: draft.note,
              media: draft.media,
              ...(draft.occurredOn ? { occurredOn: draft.occurredOn } : {}),
            }),
          ),
      );
      return;
    }
    const placeholder: RippleWithSplash = shaped(
      {
        id: draft.id,
        author_id: pool?.me ?? '',
        note: null,
        media: [],
        occurred_on: null,
        occurred_time: null,
        started_at: null,
        ended_at: null,
        planned: false,
        participants: [],
        created_at: new Date().toISOString(),
        // Mine, written now: today in my zone, as the trigger will store it.
        written_on: today,
        parent_ripple_id: null,
        thread_pool_id: sidePool,
        splash_id: target.splashId,
        splash: {
          declared_start: page.splash.declaredRange?.start ?? null,
          title: page.splash.title,
        },
      },
      draft,
    );
    run(
      (current) => ({
        ...current,
        blocks: [...current.blocks, placeholder],
        splash: { ...current.splash, count: current.splash.count + 1 },
      }),
      async () =>
        outcome(
          await addBlock({
            id: draft.id,
            note: draft.note,
            media: draft.media,
            splashId: target.splashId,
            ...(sidePool ? { threadPoolId: sidePool } : {}),
            ...(draft.occurredOn ? { occurredOn: draft.occurredOn } : {}),
          }),
        ),
    );
  }

  function removeBlock(block: RippleWithSplash): void {
    setEditor(null);
    run(
      (current) => ({
        ...current,
        blocks: current.blocks.filter((b) => b.id !== block.id),
        splash: { ...current.splash, count: Math.max(0, current.splash.count - 1) },
      }),
      async () => outcome(await deleteRipple(block.id)),
    );
  }

  function lockBlock(block: RippleWithSplash, locked: boolean): void {
    run(
      (current) => ({
        ...current,
        lockedIds: locked
          ? [...current.lockedIds, block.id]
          : current.lockedIds.filter((id) => id !== block.id),
      }),
      async () => outcome(await setRippleLock(block.id, locked)),
    );
  }

  function startBlock(): void {
    setEditor({ kind: 'add', splashId: page.splash.id });
  }

  // An edit made from the sheet a moment ago shows at once (review).
  const edited = pendingEdits[page.splash.id];
  const headerSplash = edited
    ? {
        ...page.splash,
        title: edited.title,
        icon: edited.icon,
        declaredLaneId:
          edited.declaredLaneId !== undefined ? edited.declaredLaneId : page.splash.declaredLaneId,
      }
    : page.splash;

  return (
    <div
      data-splash-page
      className="flex flex-1 flex-col bg-white pt-1 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-16"
    >
      <div data-splash-side className="flex flex-col lg:sticky lg:top-0 lg:pt-3">
        <SplashHeader
          // Remounted when an edit from the sheet lands, so it reads the new words.
          key={`${headerSplash.id}:${headerSplash.title}:${headerSplash.icon ?? ''}`}
          splash={headerSplash}
          categories={categories}
          today={today}
          onEdit={editHeader}
          onPin={pin}
          audience={audience}
          editLevel={
            orphan ? 'none' : scope === 'mine' ? 'all' : scope === 'joint' ? 'title' : 'none'
          }
          canPin={!orphan && scope !== 'theirs'}
          canDelete={scope === 'mine' || (scope === 'joint' && pool!.canDeleteJoint)}
          laneChip={pool ? pool.laneChip : undefined}
          // A block read alone has no post of mine to edit.
          onOpenEdit={
            orphan || scope === 'theirs' ? null : () => openEdit(page.splash.id, editScope)
          }
          onDelete={async () => {
            // Gone the moment it is asked for, from every surface (CLAUDE.md,
            // the principle): back where it came from, and the rows follow. A
            // block read alone is its own post, so deleting it deletes the block.
            markDeleted(page.splash.id);
            if (closeSheet) closeSheet();
            else router.push('/');
            const result =
              scope === 'joint'
                ? await deleteJointSplash(pool!.poolId, page.splash.id)
                : orphan
                  ? await deleteRipple(page.splash.id)
                  : await deleteSplash(page.splash.id);
            if (result.ok) router.refresh();
          }}
        />

        {/* Its description (0037): under the header, a divider from the ripples. */}
        <SplashDescription
          value={page.splash.description}
          editable={!orphan && (scope === 'mine' || scope === 'joint')}
          onSave={describe}
        />

        {poolTags.length > 0 ? (
          <p data-origin-tags className="text-pool-500 flex flex-wrap gap-x-3 pb-4 text-xs">
            {poolTags.map((tag) => (
              <span key={tag} data-origin-tag>
                {tag}
              </span>
            ))}
          </p>
        ) : null}

        {message || answered.message ? (
          <p role="alert" className="text-pool-500 pb-4 text-sm">
            {message ?? answered.message}
          </p>
        ) : null}
      </div>

      <div data-splash-blocks className="flex flex-col lg:pt-3">
        {threads.length > 0 ? (
          // A tab per pool whose members wrote on my record (0035).
          <div
            role="tablist"
            data-thread-tabs
            className="no-scrollbar flex gap-2 overflow-x-auto pb-2"
          >
            {threads.map((t) => (
              <button
                key={t.poolId}
                type="button"
                role="tab"
                aria-selected={tab === t.poolId}
                data-thread-tab={t.poolId}
                data-off={t.off ? '' : undefined}
                onClick={() => setTab(t.poolId)}
                className={`h-8 shrink-0 rounded-full px-3 text-sm ${
                  tab === t.poolId ? 'bg-ink text-white' : 'border-pool-200 text-ink border'
                } ${t.off ? 'opacity-50' : ''}`}
              >
                {t.off ? `${t.label} (off)` : `${t.label} · ${t.count}`}
              </button>
            ))}
          </div>
        ) : null}
        {/* Each block an entry of its own, threaded avatar to avatar (round 3). */}
        <div data-blocks className="py-2">
          <RippleThread
            initials={initials}
            // By day inside a range, then as written (0031).
            entries={orderBlocks(page.blocks.filter(showsBlock), page.splash.declaredRange).map(
              (block) => ({
                id: block.id,
                // Each ripple keeps its author in a pool (H23), and on Home
                // someone else's on my record (0035).
                initials: pool
                  ? (pool.initialsOf[block.author_id] ?? '')
                  : block.author_id !== me && initialsOf[block.author_id]
                    ? initialsOf[block.author_id]
                    : undefined,
                authorId: block.author_id,
                // Something new from someone else on my ripple since I last opened it (H25).
                dot: block.author_id === me && isUnseen(fromOthers[block.id], seenBefore),
                body: (
                  <div id={`block-${block.id}`} data-block-entry={block.id} className="pb-2">
                    {editor?.kind === 'edit' && editor.block.id === block.id ? (
                      <BlockEditor
                        target={editor}
                        range={page.splash.declaredRange}
                        today={today}
                        onSubmit={(draft) => saveBlock(editor, draft)}
                        onDelete={() => removeBlock(block)}
                        onLock={(locked) => lockBlock(block, locked)}
                        onCancel={() => setEditor(null)}
                      />
                    ) : (
                      <>
                        <BlockView
                          block={block}
                          range={page.splash.declaredRange}
                          photos={photos[block.id] ?? []}
                          clock={
                            pool
                              ? authorClock(
                                  block.started_at ?? block.created_at,
                                  timeZone,
                                  pool.zoneOf[block.author_id] ?? timeZone,
                                )
                              : null
                          }
                          timeZone={timeZone}
                          today={today}
                          onEdit={
                            editable(block)
                              ? () =>
                                  setEditor({
                                    kind: 'edit',
                                    block,
                                    locked: page.lockedIds.includes(block.id),
                                  })
                              : undefined
                          }
                        />
                        <RippleResponses
                          rippleId={block.id}
                          rippleAuthor={block.author_id}
                          value={answered.value}
                          canRespond={respondable && !page.lockedIds.includes(block.id)}
                          expanded={isExpanded(block.id)}
                          onExpand={() => setExpanded((ids) => [...ids, block.id])}
                          onReact={(emoji) => answered.react(block.id, emoji)}
                          on={answered.handlers(block.id)}
                        />
                      </>
                    )}
                  </div>
                ),
              }),
            )}
          />
        </div>

        {/* The add slot: the seat of the next block, at the bottom where the
          story continues. The ring ripples as the one invitation (law 3). */}
        {/* Someone else's splash takes no words of mine (review), unless I
          am invited on it in this pool (0035). */}
        {(scope === 'theirs' && !sidePool) || orphan ? null : (
          <div data-add-slot className="border-pool-100 mt-2 border-t pt-4 pb-10">
            {editor?.kind === 'add' ? (
              <BlockEditor
                target={editor}
                range={page.splash.declaredRange}
                today={today}
                onSubmit={(draft) => saveBlock(editor, draft)}
                onDelete={() => setEditor(null)}
                onLock={() => {}}
                onCancel={() => setEditor(null)}
              />
            ) : (
              <div className="flex items-center gap-3">
                <GhostRing label="Write the next block" onClick={startBlock} />
                <button
                  type="button"
                  onClick={startBlock}
                  className="text-main-900 text-base font-medium"
                  style={{ opacity: 0.3 }}
                >
                  Drop your words here
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
