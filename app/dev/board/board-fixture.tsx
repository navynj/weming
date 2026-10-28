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

function fixture(
  id: string,
  title: string,
  day: string,
  over: Partial<Card> = {},
  icon: string | null = null,
): Card {
  const splash = summarizeSplash(
    {
      id,
      owner_id: 'fixture',
      title,
      declared_start: day,
      declared_end: null,
      declared_lane_id: 'c-food',
      session_id: null,
      icon,
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

/** The fixture's scenes: `resize` (the default), `layers`, `captions`, `photos`. */
export type Scene = 'resize' | 'layers' | 'captions' | 'photos';

/** An opaque image of a given size, so its natural ratio is known (no server signs it). */
function image(width: number, height: number, fill: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><rect width='${width}' height='${height}' fill='${fill}'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const WIDE = 'fixture/wide.png';
const TALL = 'fixture/tall.png';
const SQUARE = 'fixture/square.png';
const PHOTO_URLS = {
  [WIDE]: image(600, 200, '#e8a33d'),
  [TALL]: image(200, 600, '#3d8be8'),
  [SQUARE]: image(400, 400, '#5fbf6a'),
  'fixture/wide-2.png': image(600, 200, '#c0587a'),
  'fixture/tall-2.png': image(200, 600, '#7a58c0'),
  'fixture/square-2.png': image(400, 400, '#58c0b4'),
  // The other scenes' photos: square, as the resize and caption specs measure them.
  'fixture/photo.webp': image(400, 400, '#d98c5f'),
  'fixture/photo-left.webp': image(400, 400, '#d98c5f'),
  'fixture/photo-right.webp': image(400, 400, '#5f9dd9'),
  'fixture/oct23.webp': image(400, 400, '#a3d95f'),
};

/**
 * Photos never cropped (review, 2026-10-27): a 3:1 and a 1:3 alone, and
 * piles of two and three with wide, tall and square mixed — all in the week
 * the board opens on, two piles with an empty day to their right.
 */
function photoCards(): Card[] {
  const of = (id: string, paths: string[]): Pick<Card, 'photos'> => ({
    photos: paths.map((path, at) => ({ rippleId: `${id}-b${at}`, path })),
  });
  return [
    fixture('ratio-wide', 'Beach', '2026-10-18', of('ratio-wide', ['fixture/wide-2.png'])),
    fixture('ratio-tall', 'Tower', '2026-10-19', of('ratio-tall', ['fixture/tall-2.png'])),
    fixture('pile-two', 'Two prints', '2026-10-20', of('pile-two', [WIDE, TALL])),
    fixture(
      'pile-three',
      'Three prints',
      '2026-10-22',
      of('pile-three', [TALL, SQUARE, 'fixture/square-2.png']),
    ),
    fixture('pile-mixed', 'Mixed prints', '2026-10-24', of('pile-mixed', [SQUARE, WIDE, TALL])),
  ];
}

const photo = (id: string): Pick<Card, 'photos'> => ({
  photos: [{ rippleId: `${id}-b`, path: `fixture/${id}.webp` }],
});

/**
 * Overlap across days: Oct 23's right-aligned photo and its caption, and
 * Oct 24's big 📚 sticker hanging left over them from its label's corner.
 * `moved`: Oct 23's photo set off its place by hand.
 */
function layerCards(saved: Record<string, BoardLayoutJson>, moved: boolean): Card[] {
  const start: Record<string, BoardLayoutJson> = {
    oct23: { photos: { 'fixture/oct23.webp': { size: 0.9, ...(moved ? { x: 0.05 } : {}) } } },
    cameron: { icon: { inline: false, size: 5 } },
  };
  const layout = (id: string): BoardLayoutJson => saved[id] ?? start[id];
  return [
    fixture('oct23', 'Beef Short Rib', '2026-10-23', {
      ...photo('oct23'),
      layout: layout('oct23'),
    }),
    fixture('cameron', 'Cameron Library', '2026-10-24', { layout: layout('cameron') }, '📚'),
  ];
}

/** A left-aligned and a right-aligned photo (the engine's draw), each with a short caption. */
function captionCards(saved: Record<string, BoardLayoutJson>): Card[] {
  const layout = (id: string): BoardLayoutJson =>
    saved[id] ?? { photos: { [`fixture/${id}.webp`]: { size: 0.5 } } };
  return [
    fixture('photo-left', 'Soup', '2026-10-20', {
      ...photo('photo-left'),
      layout: layout('photo-left'),
    }),
    fixture('photo-right', 'Tea', '2026-10-22', {
      ...photo('photo-right'),
      layout: layout('photo-right'),
    }),
  ];
}

/** Three parts to pull: a label, a sticker (Inline off) and a photo, each on its own day. */
function cards(
  tilt: number,
  saved: Record<string, BoardLayoutJson>,
  scene: Scene,
  moved: boolean,
): Card[] {
  if (scene === 'layers') return layerCards(saved, moved);
  if (scene === 'captions') return captionCards(saved);
  if (scene === 'photos') return photoCards();
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

export function BoardFixture({
  tilt,
  scene = 'resize',
  moved = false,
}: {
  tilt: number;
  scene?: Scene;
  moved?: boolean;
}) {
  // What a save would have written, kept in the page: nothing reaches the database.
  const [saved, setSaved] = useState<Record<string, BoardLayoutJson>>({});
  const shown = useMemo(() => cards(tilt, saved, scene, moved), [tilt, saved, scene, moved]);
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
            fixturePhotos={PHOTO_URLS}
          />
        </BoardFrame>
      </div>
    </PeopleProvider>
  );
}
