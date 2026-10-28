'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { MoreHorizontal, Pin, PinOff } from 'lucide-react';

import { OutlineChip } from '@/components/ui/chips/category-chip';
import { WaveRule } from '@/components/ui/waves/wave-rule';
import { impressionLineCount } from '@/components/ui/waves';
import { QuietAffordance } from '@/features/input-sheet/annotation-control';
import { LaneChips } from '@/features/input-sheet/lane-chips';
import { EmojiInput } from '@/features/lanes/emoji-input';
import type { MyCategory } from '@/lib/queries/profile';
import type { IsoDate } from '@/lib/time';

import { formatRange, type DateRange, type SplashSummary } from './summary';

/** The title's size and weight on a post's page; the top card on Home reads at the same (review). */
export const DETAIL_TITLE_CLASS = 'text-3xl font-semibold';

export type HeaderEdit = {
  title: string;
  /** The post's own icon (0008), or none. */
  icon: string | null;
  declaredStart: IsoDate | null;
  declaredEnd: IsoDate | null;
  declaredLaneId: string | null;
};

/**
 * A post's header (SPEC 5, H21): lane tags (declared first), the title at
 * display scale, the range small below, a wave underline sized to the block
 * count. Title, declared date and declared lane are edited in place; pin
 * and Delete live in the quiet menu at the right.
 */
export function SplashHeader({
  splash,
  categories,
  today,
  onEdit,
  onPin,
  onDelete,
  audience = null,
  editLevel = 'all',
  canPin = true,
  canDelete = true,
  laneChip = undefined,
}: {
  splash: SplashSummary;
  categories: MyCategory[];
  today: IsoDate;
  onEdit: (edit: HeaderEdit) => Promise<void>;
  onPin: (pinned: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  /** The Audience chip (H23), beside the lane tags; absent when I am in no pool. */
  audience?: ReactNode;
  /**
   * What may be edited in place (review): all of it on my own splash; the
   * title and icon on a joint splash (any current member); nothing on
   * someone else's.
   */
  editLevel?: 'all' | 'title' | 'none';
  canPin?: boolean;
  canDelete?: boolean;
  /** In a pool: the pool lane's chip in place of my lane tags (others' lanes are theirs). */
  laneChip?: { icon: string | null; name: string } | null;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(splash.title);
  const [icon, setIcon] = useState(splash.icon ?? '');
  const [editingDate, setEditingDate] = useState(false);
  const [range, setRange] = useState<{ start: IsoDate; end: IsoDate | null } | null>(
    // Every post has a date (H24): its own, else the day it was made.
    splash.range ? { start: splash.range.start, end: splash.range.end } : null,
  );
  const [editingLane, setEditingLane] = useState(false);
  const [menu, setMenu] = useState<'closed' | 'open' | 'delete'>('closed');
  const [pending, startTransition] = useTransition();

  const header = (over: Partial<HeaderEdit> = {}): HeaderEdit => ({
    title: title.trim(),
    icon: splash.icon,
    declaredStart: range?.start ?? null,
    declaredEnd: range?.end ?? null,
    declaredLaneId: splash.declaredLaneId,
    ...over,
  });
  const run = (work: () => Promise<void>): void => startTransition(work);

  const tags = splash.laneIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is MyCategory => Boolean(c));
  const lines = Math.max(1, impressionLineCount(splash.count));
  const displayRange: DateRange | null = splash.range;

  return (
    <header data-splash-header className="flex flex-col gap-2 pb-6">
      <div className="flex items-start justify-between gap-3">
        {/* The post's lane (H24): every block takes it. Tapping it edits it. */}
        {editLevel !== 'all' ? (
          <span data-lane-tags className="flex min-h-5 min-w-0 flex-1 flex-wrap items-center gap-1">
            {laneChip ? (
              <OutlineChip icon={laneChip.icon} name={laneChip.name} />
            ) : (
              tags.map((lane) => <OutlineChip key={lane.id} icon={lane.icon} name={lane.name} />)
            )}
          </span>
        ) : editingLane ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <LaneChips
              categories={categories}
              selectedId={splash.declaredLaneId}
              surface="white"
              onSelect={(id) => {
                setEditingLane(false);
                run(() => onEdit(header({ declaredLaneId: id })));
              }}
            />
            <button
              type="button"
              onClick={() => setEditingLane(false)}
              className="text-pool-500 self-start text-xs"
            >
              Done
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Edit the declared lane"
            data-lane-tags
            onClick={() => setEditingLane(true)}
            className="flex min-h-5 min-w-0 flex-1 flex-wrap items-center gap-1"
          >
            {tags.map((lane) => (
              <OutlineChip key={lane.id} icon={lane.icon} name={lane.name} />
            ))}
            {tags.length === 0 ? <span className="text-pool-500 text-[10px]">+ lane</span> : null}
          </button>
        )}

        {audience}

        {canPin || canDelete ? (
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="More"
              aria-expanded={menu !== 'closed'}
              onClick={() => setMenu(menu === 'closed' ? 'open' : 'closed')}
              className="text-pool-500 flex h-8 w-8 items-center justify-center"
            >
              <MoreHorizontal aria-hidden size={18} />
            </button>

            {menu === 'open' ? (
              <ul
                role="menu"
                data-header-menu
                className="border-pool-100 absolute top-full right-0 z-10 flex w-52 flex-col rounded-xl border bg-white py-1 text-sm shadow-lg"
              >
                {canPin ? (
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={pending}
                      onClick={() => {
                        setMenu('closed');
                        run(() => onPin(splash.pinnedAt === null));
                      }}
                      className="text-ink hover:bg-pool-100 flex w-full items-center gap-2 px-3 py-2 text-left"
                    >
                      {splash.pinnedAt ? (
                        <PinOff aria-hidden size={14} />
                      ) : (
                        <Pin aria-hidden size={14} />
                      )}
                      {splash.pinnedAt ? 'Unpin' : 'Pin'}
                    </button>
                  </li>
                ) : null}
                {canDelete ? (
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => setMenu('delete')}
                      className="text-pool-500 hover:bg-pool-100 flex w-full items-center gap-2 px-3 py-2 text-left"
                    >
                      Delete
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}

            {menu === 'delete' ? (
              <div
                role="alertdialog"
                className="border-pool-100 absolute top-full right-0 z-10 flex w-60 flex-col gap-2 rounded-xl border bg-white px-3 py-2 text-sm shadow-lg"
              >
                <p data-delete-confirm className="text-pool-500">
                  Deletes the post and its {splash.count} block{splash.count === 1 ? '' : 's'}.
                </p>
                <span className="flex gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(onDelete)}
                    className="text-main-900 font-medium disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setMenu('closed')} className="text-pool-500">
                    Keep
                  </button>
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* The title, edited where it is read. */}
      <div className="flex items-start gap-3">
        {/* The post's own icon, edited in place (0008): one glyph, saved as it
          is chosen; emptied, the lane's emoji stands for the post again. */}
        {editLevel === 'none' ? (
          splash.icon ? (
            <span aria-hidden className="text-3xl/none">
              {splash.icon}
            </span>
          ) : null
        ) : (
          <EmojiInput
            value={icon}
            onChange={(next) => {
              setIcon(next);
              if ((next || null) !== splash.icon) run(() => onEdit(header({ icon: next || null })));
            }}
            label="Icon"
            placeholder={categories.find((c) => c.id === splash.laneIds[0])?.icon ?? '🙂'}
          />
        )}
        <div className="min-w-0 flex-1">
          {editLevel === 'none' ? (
            <h1 data-splash-title className={`text-ink ${DETAIL_TITLE_CLASS}`}>
              {splash.title.trim() ? (
                splash.title
              ) : (
                <span className="opacity-30">{splash.ghostTitle ?? 'Untitled'}</span>
              )}
            </h1>
          ) : editingTitle ? (
            <input
              value={title}
              autoFocus
              aria-label="Title"
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                setEditingTitle(false);
                if (title.trim() !== splash.title.trim()) run(() => onEdit(header()));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  setTitle(splash.title);
                  setEditingTitle(false);
                }
              }}
              className={`text-ink w-full ${DETAIL_TITLE_CLASS} outline-none`}
            />
          ) : (
            <button
              type="button"
              aria-label="Edit the title"
              onClick={() => setEditingTitle(true)}
              className="text-left"
            >
              <h1 data-splash-title className={`text-ink ${DETAIL_TITLE_CLASS}`}>
                {splash.title.trim() ? (
                  splash.title
                ) : (
                  <span className="opacity-30">{splash.ghostTitle ?? 'Untitled'}</span>
                )}
              </h1>
            </button>
          )}
        </div>
      </div>

      {/* Sized by the title's width, never sizing it. */}
      <span data-wave-underline data-lines={lines} className="flex w-fit max-w-full flex-col">
        {Array.from({ length: lines }, (_, index) => (
          <span key={index} className="block w-40">
            <WaveRule anchor="left" />
          </span>
        ))}
      </span>

      {/* The range: declared (its own to edit), else derived from the blocks. */}
      {editLevel !== 'all' ? (
        displayRange ? (
          <span data-range className="text-pool-500 text-xs tabular-nums">
            {formatRange(displayRange)}
          </span>
        ) : null
      ) : editingDate ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            lang="en"
            aria-label="Start date"
            value={range?.start ?? today}
            onChange={(event) =>
              event.target.value && setRange({ start: event.target.value, end: range?.end ?? null })
            }
            className="text-ink bg-pool-100 rounded px-2 py-1 tabular-nums"
          />
          <span aria-hidden className="text-pool-500">
            ~
          </span>
          <input
            type="date"
            lang="en"
            aria-label="End date"
            value={range?.end ?? ''}
            onChange={(event) =>
              setRange({ start: range?.start ?? today, end: event.target.value || null })
            }
            className="text-ink bg-pool-100 rounded px-2 py-1 tabular-nums"
          />
          <button
            type="button"
            onClick={() => {
              const next = range ?? { start: today, end: null };
              setRange(next);
              setEditingDate(false);
              run(() => onEdit(header({ declaredStart: next.start, declaredEnd: next.end })));
            }}
            className="text-main-900 font-medium"
          >
            Done
          </button>
        </div>
      ) : displayRange ? (
        <button
          type="button"
          aria-label="Edit the declared date"
          data-range
          onClick={() => setEditingDate(true)}
          className="text-pool-500 text-left text-xs tabular-nums"
        >
          {formatRange(displayRange)}
        </button>
      ) : (
        <QuietAffordance onClick={() => setEditingDate(true)} label="+ Add Date" />
      )}
    </header>
  );
}
