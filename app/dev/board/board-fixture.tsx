'use client';

import { useCallback, useMemo, useState } from 'react';

import { placeCard, type Card } from '@/features/home/grid';
import type { setBoardLayout } from '@/features/month-board/actions';
import {
  clearLayout,
  mergeLayout,
  type BoardLayoutJson,
} from '@/features/month-board/board-layout';
import { BoardFrame, MonthBoard } from '@/features/month-board/month-board';
import { useBoardEditing, useLayoutHistory } from '@/features/month-board/use-board-editing';
import { useLayoutDrafts } from '@/features/month-board/use-layout-drafts';
import { PeopleProvider } from '@/features/people/people-provider';
import { summarizeSplash, type Splash } from '@/features/splash/summary';

const TZ = 'America/Vancouver';
const TODAY = '2026-10-23';
const LANES = [{ id: 'c-food', name: 'Food', icon: '🍜' }];

function fixture(id: string, title: string, day: string, over: Partial<Card> = {}): Card {
  const splash = summarizeSplash(
    {
      id,
      owner_id: 'fixture',
      title,
      declared_start: day,
      declared_end: null,
      declared_lane_id: 'c-food',
      session_id: null,
      icon: null,
      pinned_at: null,
      pool_id: null,
      pool_lane_id: null,
      own_pool_id: null,
      created_by: null,
      type: 'free',
      prompt: null,
      ends_at: null,
      created_at: `${day}T18:00:00.000Z`,
      written_on: day,
    } as unknown as Splash,
    [
      {
        id: `${id}-b`,
        note: id,
        occurred_on: day,
        occurred_time: null,
        created_at: `${day}T18:00:00.000Z`,
      },
    ],
    TZ,
    new Date('2026-10-26T20:00:00.000Z'),
  );
  return { ...placeCard(splash, '', TZ), ...over };
}

/** Three parts to pull: a label, a sticker (Inline off) and a photo, each on its own day. */
function cards(tilt: number, saved: Record<string, BoardLayoutJson>): Card[] {
  const turned = tilt ? { tilt } : {};
  const start: Record<string, BoardLayoutJson> = {
    label: { label: turned },
    sticker: { icon: { inline: false, ...turned } },
    photo: { photos: { 'fixture/photo.webp': { size: 0.6, ...turned } } },
  };
  const layout = (id: string): BoardLayoutJson => saved[id] ?? start[id];
  return [
    fixture('label', 'Lost Ruins of Arnak', '2026-10-19', { layout: layout('label') }),
    fixture('sticker', 'Lynn Canyon', '2026-10-21', { layout: layout('sticker') }),
    fixture('photo', 'Beef Short Rib', '2026-10-23', {
      photos: [{ rippleId: 'photo-b', path: 'fixture/photo.webp' }],
      layout: layout('photo'),
    }),
  ];
}

export function BoardFixture({ tilt }: { tilt: number }) {
  // What a save would have written, kept in the page: nothing reaches the database.
  const [saved, setSaved] = useState<Record<string, BoardLayoutJson>>({});
  const shown = useMemo(() => cards(tilt, saved), [tilt, saved]);
  const keep = useCallback<typeof setBoardLayout>(
    async ({ splashId, patch, clear }) => {
      let next: BoardLayoutJson = {};
      setSaved((all) => {
        const was = all[splashId] ?? shown.find((c) => c.splash.id === splashId)?.layout ?? {};
        next = clearLayout(mergeLayout(was, patch ?? {}), clear ?? []);
        return { ...all, [splashId]: next };
      });
      return { ok: true, layout: next };
    },
    [shown],
  );
  const [top, setTop] = useState<string | null>(null);
  const history = useLayoutHistory();
  const drafts = useLayoutDrafts(shown, null, 'calendar', history.recorders.calendar, keep);
  const editing = useBoardEditing({
    drafts,
    history,
    view: 'calendar',
    topId: top,
    canEdit: true,
    onPick: setTop,
    onMore: () => {},
  });
  return (
    <PeopleProvider me="fixture" people={{}}>
      <div data-board-fixture className="water-ground flex h-dvh flex-col">
        <BoardFrame>
          <MonthBoard
            cards={drafts.drawn}
            month="2026-10"
            onMonth={() => {}}
            today={TODAY}
            onPick={setTop}
            lanes={LANES}
            editing={editing}
          />
        </BoardFrame>
      </div>
    </PeopleProvider>
  );
}
