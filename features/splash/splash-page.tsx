'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { GhostRing } from '@/components/ui/ghost-ring';
import { commitRipple, type CommitResult } from '@/features/input-sheet/commit';
import { useInputSheet } from '@/features/input-sheet/sheet-provider';
import { deleteRipple, setRippleLock, updateRipple } from '@/features/ripple-sheet/actions';
import type { MyCategory } from '@/lib/queries/profile';
import type { RippleWithCategory } from '@/lib/queries/ripples';
import type { IsoDate } from '@/lib/time';
import { useOptimisticAction, type ActionOutcome } from '@/lib/use-optimistic-action';

import { deleteJointSplash } from '@/features/pool/actions';
import { authorClock } from '@/features/pool/times';
import { usePoolEditScope } from '@/features/pool/edit-scope';

import { adoptRipple, deleteSplash, setSplashPinned, updateSplashHeader } from './actions';
import { BlockEditor, type BlockDraft, type EditorTarget } from './block-editor';
import { BlockView } from './block';
import { RippleThread } from './ripple-thread';
import { useCloseSplash } from './splash-modal';
import { SplashHeader, type HeaderEdit } from './splash-header';
import { laneTags, type SplashSummary } from './summary';

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

/** What the page holds and edits: the post and its blocks, as one value. */
type PageState = { splash: SplashSummary; blocks: RippleWithCategory[]; lockedIds: string[] };

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
 * A splashless block renders here too, as an untitled post of one; it gets a
 * row of its own the first time it needs one (H21a) and the page moves to it.
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
}: {
  splash: SplashSummary;
  /** Oldest first. */
  blocks: RippleWithCategory[];
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
}) {
  // Mine to edit: everything off a pool; in one, my own ripples only.
  const editable = (block: RippleWithCategory): boolean => !pool || block.author_id === pool.me;
  const scope = pool?.scope ?? 'mine';
  // A joint splash's ripples take my linked lane or none, decided on the
  // server (0016, 0017): no lane chips, as on a Just-mine splash.
  const laneless = splash.ownPoolId !== null || scope === 'joint';
  const router = useRouter();
  const { markDeleted, openEdit, pendingEdits } = useInputSheet();
  const editScope = usePoolEditScope();
  // Inside the splash sheet (review): a delete closes it over the screen beneath.
  const closeSheet = useCloseSplash();
  const [editor, setEditor] = useState<EditorTarget | null>(() =>
    writing && !splash.orphan ? { kind: 'add', splashId: splash.id } : null,
  );
  const {
    value: page,
    run,
    message,
  } = useOptimisticAction<PageState>({
    splash,
    blocks,
    lockedIds,
  });

  /** The post's row, made now if the post is a lone block (H21a). */
  async function ensureSplash(): Promise<string | null> {
    if (!page.splash.orphan) return page.splash.id;
    const result = await adoptRipple(page.splash.id);
    if (!result.ok) return null;
    router.replace(`/splash/${result.splash.id}`);
    return result.splash.id;
  }

  /** A header change, shown at once; the row is made first if there is none. */
  function editHeader(edit: HeaderEdit): Promise<void> {
    run(
      (current) => ({
        ...current,
        splash: {
          ...current.splash,
          title: edit.title,
          icon: edit.icon,
          declaredLaneId: edit.declaredLaneId,
          laneIds: laneTags(edit.declaredLaneId, current.blocks),
          declaredRange: edit.declaredStart
            ? { start: edit.declaredStart, end: edit.declaredEnd ?? edit.declaredStart }
            : null,
        },
      }),
      async () => {
        const id = await ensureSplash();
        return id ? updateSplashHeader(id, edit) : { ok: false, message: 'That post is gone.' };
      },
    );
    return Promise.resolve();
  }

  function pin(pinned: boolean): Promise<void> {
    run(
      (current) => ({
        ...current,
        splash: { ...current.splash, pinnedAt: pinned ? new Date().toISOString() : null },
      }),
      async () => {
        const id = await ensureSplash();
        return id ? setSplashPinned(id, pinned) : { ok: false, message: 'That post is gone.' };
      },
    );
    return Promise.resolve();
  }

  /** The block as the screen should show it, from what the editor handed back. */
  function shaped(base: RippleWithCategory, draft: BlockDraft): RippleWithCategory {
    const lane = categories.find((c) => c.id === draft.categoryId) ?? null;
    return {
      ...base,
      category_id: draft.categoryId ?? base.category_id,
      category: lane ? { name: lane.name, icon: lane.icon } : base.category,
      note: draft.note.trim().length > 0 ? draft.note : null,
      media: draft.media,
      occurred_on: draft.occurredOn,
      occurred_time: draft.occurredTime ? `${draft.occurredTime}:00` : null,
      started_at: draft.startInstant,
      ended_at: draft.endInstant ?? draft.startInstant,
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
          outcome(await updateRipple({ ...draft, id: block.id, splashId: block.splash_id })),
      );
      return;
    }
    const placeholder: RippleWithCategory = shaped(
      {
        id: draft.id,
        author_id: pool?.me ?? '',
        category_id: draft.categoryId ?? '',
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
        splash_id: target.splashId,
        category: null,
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
        splash: {
          ...current.splash,
          count: current.splash.count + 1,
          laneIds: laneTags(current.splash.declaredLaneId, [...current.blocks, placeholder]),
        },
      }),
      async () => outcome(await commitRipple({ ...draft, splashId: target.splashId })),
    );
  }

  function removeBlock(block: RippleWithCategory): void {
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

  function lockBlock(block: RippleWithCategory, locked: boolean): void {
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
    void ensureSplash().then((id) => id && setEditor({ kind: 'add', splashId: id }));
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
          editLevel={scope === 'mine' ? 'all' : scope === 'joint' ? 'title' : 'none'}
          canPin={scope !== 'theirs'}
          canDelete={scope === 'mine' || (scope === 'joint' && pool!.canDeleteJoint)}
          laneChip={pool ? pool.laneChip : undefined}
          // A post of one has no row to edit yet; it gets one from the header itself.
          onOpenEdit={
            page.splash.orphan || scope === 'theirs'
              ? null
              : () => openEdit(page.splash.id, editScope)
          }
          onDelete={async () => {
            // Gone the moment it is asked for, from every surface (CLAUDE.md,
            // the principle): back where it came from, and the rows follow. A
            // lone block is its own post, so deleting it deletes the block.
            markDeleted(page.splash.id);
            if (closeSheet) closeSheet();
            else router.push('/');
            const result =
              scope === 'joint'
                ? await deleteJointSplash(pool!.poolId, page.splash.id)
                : page.splash.orphan
                  ? await deleteRipple(page.splash.id)
                  : await deleteSplash(page.splash.id);
            if (result.ok) router.refresh();
          }}
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

        {message ? (
          <p role="alert" className="text-pool-500 pb-4 text-sm">
            {message}
          </p>
        ) : null}
      </div>

      <div data-splash-blocks className="flex flex-col lg:pt-3">
        {/* Each block an entry of its own, threaded avatar to avatar (round 3). */}
        <div data-blocks className="py-2">
          <RippleThread
            initials={initials}
            entries={page.blocks.map((block) => ({
              id: block.id,
              // Each ripple keeps its author in a pool (H23).
              initials: pool ? (pool.initialsOf[block.author_id] ?? '') : undefined,
              authorId: block.author_id,
              body: (
                <div id={`block-${block.id}`} data-block-entry={block.id} className="pb-2">
                  {editor?.kind === 'edit' && editor.block.id === block.id ? (
                    <BlockEditor
                      target={editor}
                      categories={categories}
                      defaultLaneId={page.splash.declaredLaneId}
                      laneless={laneless}
                      timeZone={timeZone}
                      today={today}
                      onSubmit={(draft) => saveBlock(editor, draft)}
                      onDelete={() => removeBlock(block)}
                      onLock={(locked) => lockBlock(block, locked)}
                      onCancel={() => setEditor(null)}
                    />
                  ) : (
                    <BlockView
                      block={block}
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
                  )}
                </div>
              ),
            }))}
          />
        </div>

        {/* The add slot: the seat of the next block, at the bottom where the
          story continues. The ring ripples as the one invitation (law 3). */}
        {/* Someone else's splash takes no words of mine (review). */}
        {scope === 'theirs' ? null : (
          <div data-add-slot className="border-pool-100 mt-2 border-t pt-4 pb-10">
            {editor?.kind === 'add' ? (
              <BlockEditor
                target={editor}
                categories={categories}
                defaultLaneId={page.splash.declaredLaneId}
                laneless={laneless}
                timeZone={timeZone}
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
