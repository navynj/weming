import { placeCard, type Card, type CardRipple } from '@/features/home/grid';
import { summarizeSplash, type Splash } from '@/features/splash/summary';

import { written } from './written-on';

/**
 * Records for a shared image's privacy tests (H63): mine, and others' with
 * every field that could carry them — title, icon, words, photos, names,
 * initials, faces, the pool's name and photo — each holding a sentinel that
 * must never reach the image.
 */
export const ME = 'u-me';
export const MINA = 'u-mina';
/** A video my words link to: its thumbnail comes from the server, as a data URL. */
export const MY_VIDEO = 'MyVideo1234';
const TZ = 'America/Vancouver';
const NOW = new Date('2026-10-29T20:00:00.000Z');

/** Every string a shared image must not hold. */
export const SENTINELS = [
  'SENTINEL-TITLE',
  'SENTINEL-NOTE',
  'SENTINEL-JOINT',
  'SENTINEL-RANGE',
  'SENTINEL-UNFLAGGED',
  'SENTINEL-POOL',
  'SENTINEL-POOLPHOTO',
  'SENTINEL-GHOST',
  'SENTINEL-DESC',
  'Mina Kim',
  'MK',
  `${MINA}/`,
  '🦄',
  'MinaVideo12',
];

/** My photos' data URLs, by path: the only images a shared image may draw. */
export const MY_PHOTOS = {
  [`${ME}/swim.webp`]: 'data:image/png;base64,TUlORS1zd2lt',
  [`${ME}/side.webp`]: 'data:image/png;base64,TUlORS1zaWRl',
};

function splash(
  id: string,
  title: string,
  day: string,
  over: Partial<Splash> = {},
): Parameters<typeof summarizeSplash>[0] {
  return written({
    id,
    owner_id: ME,
    title,
    declared_start: day,
    declared_end: null,
    declared_lane_id: 'c-day',
    session_id: null,
    icon: null,
    pinned_at: null,
    pool_id: null,
    pool_lane_id: null,
    own_pool_id: null,
    joint_invite_all: false,
    is_welcome: false,
    description: null,
    created_by: null,
    type: 'free',
    prompt: null,
    ends_at: null,
    created_at: `${day}T18:00:00.000Z`,
    ...over,
  });
}

function card(
  id: string,
  title: string,
  day: string,
  ripples: (CardRipple & { media?: string[] })[],
  over: Partial<Splash> = {},
): Card {
  const summary = summarizeSplash(
    splash(id, title, day, over),
    ripples.map((r) => ({
      id: r.id,
      note: r.note,
      occurred_on: day,
      occurred_time: null,
      created_at: r.createdAt,
    })),
    TZ,
    NOW,
  );
  const placed = placeCard(summary, ripples.map((r) => r.note).join('\n\n'), TZ, ripples);
  // A `yt:` item is a video its words link to (part 5), drawn as its thumbnail.
  const photos = ripples.flatMap((r) =>
    (r.media ?? []).map((path) =>
      path.startsWith('yt:')
        ? { rippleId: r.id, path, video: { id: path.slice(3), start: null, short: false } }
        : { rippleId: r.id, path },
    ),
  );
  return photos.length > 0 ? { ...placed, photos } : placed;
}

const at = (day: string): string => `${day}T19:00:00.000Z`;

/**
 * The week of Oct 25–31, 2026, as a pool's Calendar draws it: my record,
 * my record with Mina's side on it, Mina's record, Mina's joint record I
 * wrote on, Mina's ranged record, and a record no builder flagged.
 */
export function shareCards(): Card[] {
  const mine = {
    ...card('mine', 'Morning swim', '2026-10-27', [
      {
        id: 'mine-1',
        note: 'Cold water',
        createdAt: at('2026-10-27'),
        byMe: true,
        media: [`${ME}/swim.webp`, `yt:${MY_VIDEO}`],
      },
    ]),
    madeByMe: true,
    authorFace: true,
    authorId: ME,
    author: 'ME',
  };
  const withSide = {
    ...card(
      'with-side',
      'Dinner at home',
      '2026-10-28',
      [
        {
          id: 'side-me',
          note: 'I cooked',
          createdAt: at('2026-10-28'),
          byMe: true,
          media: [`${ME}/side.webp`],
        },
        {
          id: 'side-mina',
          note: 'SENTINEL-NOTE from Mina',
          createdAt: at('2026-10-28'),
          authorId: MINA,
          authorName: 'Mina Kim',
          initials: 'MK',
          media: [`${MINA}/SENTINEL-side.webp`],
        },
      ],
      { description: 'SENTINEL-DESC' },
    ),
    madeByMe: true,
    together: true,
    writers: [
      { authorId: ME, initials: 'ME' },
      { authorId: MINA, initials: 'MK' },
    ],
    pools: ['SENTINEL-POOL'],
    poolPhoto: 'https://img/SENTINEL-POOLPHOTO.png',
    sides: [{ label: 'SENTINEL-POOL', count: 1 }],
    origins: ['SENTINEL-POOL · 🦄 Trips'],
  };
  const theirs = {
    ...card(
      'theirs',
      'SENTINEL-TITLE of Mina',
      '2026-10-26',
      [
        {
          id: 'theirs-1',
          note: 'SENTINEL-NOTE secret',
          createdAt: at('2026-10-26'),
          authorId: MINA,
          authorName: 'Mina Kim',
          initials: 'MK',
          media: [`${MINA}/SENTINEL-photo.webp`, 'yt:MinaVideo12'],
        },
      ],
      { owner_id: MINA, icon: '🦄' },
    ),
    madeByMe: false,
    authorFace: true,
    authorId: MINA,
    author: 'MK',
    authorName: 'Mina Kim',
    lane: { icon: '🦄', name: 'SENTINEL-POOL lane' },
    href: '/pool/SENTINEL-POOL',
  };
  const joint = {
    ...card(
      'joint',
      'SENTINEL-JOINT by Mina',
      '2026-10-29',
      [
        {
          id: 'joint-mina',
          note: 'SENTINEL-GHOST first words',
          createdAt: at('2026-10-29'),
          authorId: MINA,
          authorName: 'Mina Kim',
          initials: 'MK',
        },
        // My side on her record: on her frame, so not drawn (the title follows its maker).
        {
          id: 'joint-me',
          note: 'my side',
          createdAt: at('2026-10-29'),
          byMe: true,
          media: [`${ME}/side.webp`],
        },
      ],
      { owner_id: null, created_by: MINA },
    ),
    madeByMe: false,
    joint: true,
    together: true,
    waitsForMe: true,
    writers: [{ authorId: MINA, initials: 'MK' }],
    branches: [{ id: 'joint-mina', column: 'lane', initials: 'MK', authorId: MINA }],
  };
  const ranged = {
    ...card(
      'ranged',
      'SENTINEL-RANGE trip',
      '2026-10-25',
      [
        {
          id: 'ranged-1',
          note: 'SENTINEL-NOTE away',
          createdAt: at('2026-10-25'),
          authorId: MINA,
          authorName: 'Mina Kim',
          initials: 'MK',
        },
      ],
      { owner_id: MINA, declared_end: '2026-10-27' },
    ),
    madeByMe: false,
  };
  // No builder said whose it is: a shape, so a builder that forgets cannot leak.
  const unflagged = card('unflagged', 'SENTINEL-UNFLAGGED', '2026-10-30', [
    { id: 'unflagged-1', note: 'SENTINEL-NOTE unflagged', createdAt: at('2026-10-30') },
  ]);
  return [mine, withSide, theirs, joint, ranged, unflagged];
}
